import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma';
import { llmClient, LLM_MODEL } from './llm.client';
import { extractCVText } from './cv.service';
import { extractExperienceTable } from './cvExperienceExtractor.service';
import { getIssueRef, postReply, resolveThreadRoot } from './linear.service';
import {
  CV_CONSISTENCY_SYSTEM_PROMPT,
  buildCvConsistencyUserMessage,
} from '../prompts/cvConsistency.prompt';
import { describeError } from '../utils/errorLogger';

const THRESHOLD = Number(process.env.CV_DISCREPANCY_THRESHOLD ?? 15);
const LOOKBACK_DAYS = Number(process.env.CV_CONSISTENCY_LOOKBACK_DAYS ?? 180);
const SKILL_WEIGHT = 0.6;
const TEXT_WEIGHT = 0.4;

function alertsEnabled(): boolean {
  return (process.env.CV_CONSISTENCY_ALERTS ?? 'off').toLowerCase() === 'on';
}

export function normalizeCandidateKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'was', 'were', 'has', 'had', 'have',
  'this', 'that', 'their', 'years', 'year', 'months', 'using', 'used', 'work',
  'worked', 'project', 'projects', 'company', 'team', 'experience', 'role',
  'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'лет', 'год', 'года', 'опыт',
]);

function textTokens(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(tokens);
}

function normalizeTech(t: string): string {
  return t.toLowerCase().replace(/\.js$/, '').replace(/[^\p{L}\p{N}+#.]/gu, '').trim();
}

async function skillSet(cvText: string): Promise<Set<string>> {
  try {
    const table = await extractExperienceTable(cvText);
    return new Set(table.rows.map((r) => normalizeTech(r.technology)).filter(Boolean));
  } catch (err) {
    console.warn('[cv-consistency] skill extraction failed, text-only', describeError(err));
    return new Set();
  }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

async function discrepancyPercent(cvA: string, cvB: string): Promise<number> {
  const [sa, sb] = await Promise.all([skillSet(cvA), skillSet(cvB)]);
  const textSim = jaccard(textTokens(cvA), textTokens(cvB));
  const sim =
    sa.size === 0 && sb.size === 0
      ? textSim
      : SKILL_WEIGHT * jaccard(sa, sb) + TEXT_WEIGHT * textSim;
  return Math.round((1 - sim) * 100);
}

async function confirmSamePerson(params: {
  candidateName: string;
  currentRole?: string | null;
  currentClient?: string | null;
  currentCv: string;
  priorRole?: string | null;
  priorClient?: string | null;
  priorCv: string;
}): Promise<{ samePerson: boolean; reason: string }> {
  try {
    const res = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: CV_CONSISTENCY_SYSTEM_PROMPT },
        { role: 'user', content: buildCvConsistencyUserMessage(params) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 400,
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { samePerson?: unknown; reason?: unknown };
    return {
      samePerson: typeof parsed.samePerson === 'boolean' ? parsed.samePerson : true,
      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'The CVs differ substantially in professional content.',
    };
  } catch (err) {
    console.warn('[cv-consistency] LLM verdict failed, assuming same person', describeError(err));
    return { samePerson: true, reason: 'The CVs differ substantially in professional content.' };
  }
}

async function resolveCvText(c: {
  cvText: string | null;
  cvUrl: string;
}): Promise<string | undefined> {
  if (c.cvText && c.cvText.trim()) return c.cvText;
  return extractCVText(c.cvUrl).catch(() => undefined);
}

function buildAlertBody(p: {
  discrepancy: number;
  currentCvUrl: string;
  priorIssueUrl: string | null;
  priorIssueIdentifier: string | null;
  priorRole?: string | null;
  priorDate: Date;
  reason: string;
}): string {
  const when = p.priorDate.toISOString().slice(0, 10);
  const issueRef =
    p.priorIssueIdentifier && p.priorIssueUrl
      ? `[${p.priorIssueIdentifier}](${p.priorIssueUrl})`
      : p.priorIssueUrl ?? p.priorIssueIdentifier ?? 'earlier issue';
  const priorParts = [issueRef, p.priorRole].filter(Boolean).join(' — ');

  const lines = [
    `⚠️ **Possible CV mismatch** — this candidate's current CV differs by **~${p.discrepancy}%** from an earlier submission (threshold ${THRESHOLD}%).`,
    '',
    `• **Current CV:** ${p.currentCvUrl}`,
    `• **Previous submission:** ${priorParts} · DATE: ${when}`,
  ];
  if (p.reason) lines.push('', p.reason);
  lines.push('', 'Please verify the correct CV was attached.');
  return lines.join('\n');
}

export async function runCvConsistencyCheck(rootCommentId: string): Promise<void> {
  console.log('[cv-consistency] start', { rootCommentId, enabled: alertsEnabled() });
  if (!alertsEnabled()) return;

  const current = await prisma.pipelineCandidate.findUnique({ where: { rootCommentId } });
  if (!current?.candidateName) {
    console.log('[cv-consistency] skip: no candidate/name', { rootCommentId, found: !!current });
    return;
  }

  const currentCvText = await resolveCvText(current);
  if (!currentCvText) {
    console.log('[cv-consistency] skip: no CV text', { rootCommentId, cvUrl: current.cvUrl });
    return;
  }

  const key = normalizeCandidateKey(current.candidateName);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const candidates = await prisma.pipelineCandidate.findMany({
    where: {
      rootCommentId: { not: rootCommentId },
      cvSubmittedAt: { gte: since },
      candidateName: { not: null },
    },
    orderBy: { cvSubmittedAt: 'desc' },
  });

  const priors = candidates.filter(
    (p) => p.candidateName && normalizeCandidateKey(p.candidateName) === key,
  );
  console.log('[cv-consistency] grouping', {
    candidateName: current.candidateName,
    key,
    candidatesScanned: candidates.length,
    priorsMatched: priors.length,
    otherKeys: candidates.map((p) => normalizeCandidateKey(p.candidateName ?? '')),
  });
  if (priors.length === 0) return;

  let worst: { prior: (typeof priors)[number]; priorCv: string; discrepancy: number } | null = null;
  for (const prior of priors) {
    const priorCv = await resolveCvText(prior);
    if (!priorCv) continue;
    const discrepancy = await discrepancyPercent(currentCvText, priorCv);
    if (!worst || discrepancy > worst.discrepancy) worst = { prior, priorCv, discrepancy };
  }

  console.log('[cv-consistency] discrepancy', {
    rootCommentId,
    worstDiscrepancy: worst?.discrepancy ?? null,
    threshold: THRESHOLD,
    priorRootCommentId: worst?.prior.rootCommentId ?? null,
  });
  if (!worst || worst.discrepancy < THRESHOLD) return;

  const pairHash = createHash('sha256')
    .update([rootCommentId, worst.prior.rootCommentId].sort().join('|'))
    .digest('hex');

  const existing = await prisma.cvConsistencyAlert.findUnique({ where: { pairHash } });
  if (existing?.posted) return;

  // Same name + content discrepancy ≥ threshold is the rule. The LLM is used
  // only to describe the difference, not to gate the alert.
  const verdict = await confirmSamePerson({
    candidateName: current.candidateName,
    currentRole: current.role,
    currentClient: current.clientName,
    currentCv: currentCvText,
    priorRole: worst.prior.role,
    priorClient: worst.prior.clientName,
    priorCv: worst.priorCv,
  });

  let posted = false;
  let postFailed = false;
  {
    const ref = await getIssueRef(worst.prior.linearIssueId).catch(() => null);
    const body = buildAlertBody({
      discrepancy: worst.discrepancy,
      currentCvUrl: current.cvUrl,
      priorIssueUrl: ref?.url ?? null,
      priorIssueIdentifier: ref?.identifier ?? null,
      priorRole: worst.prior.role,
      priorDate: worst.prior.cvSubmittedAt,
      reason: verdict.reason,
    });
    try {
      // rootCommentId карточки — это комментарий, в котором лежало резюме, и он
      // сам может быть реплаем (см. resolveThreadRoot).
      const parentId = await resolveThreadRoot(current.rootCommentId);
      await postReply(current.linearIssueId, parentId, body);
      posted = true;
    } catch (err) {
      postFailed = true;
      console.warn('[cv-consistency] failed to post Linear comment', describeError(err));
    }
  }

  await prisma.cvConsistencyAlert.upsert({
    where: { pairHash },
    create: {
      candidateKey: key,
      newRootCommentId: rootCommentId,
      priorRootCommentId: worst.prior.rootCommentId,
      pairHash,
      discrepancy: worst.discrepancy,
      samePerson: verdict.samePerson,
      reason: verdict.reason,
      posted,
    },
    update: { samePerson: verdict.samePerson, reason: verdict.reason, discrepancy: worst.discrepancy, posted },
  });

  console.log('[cv-consistency] done', {
    rootCommentId,
    discrepancy: worst.discrepancy,
    samePerson: verdict.samePerson,
    posted,
  });

  // Let BullMQ retry transient Linear failures (the row stays posted=false).
  if (postFailed) throw new Error('cv-consistency: Linear post failed, will retry');
}
