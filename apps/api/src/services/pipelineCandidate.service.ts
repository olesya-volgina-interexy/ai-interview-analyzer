// apps/api/src/services/pipelineCandidate.service.ts
//
// Shared by the Linear comment webhook and the pipeline backfill script.
// A PipelineCandidate row is written in two phases: created immediately from
// data we already have, then best-effort enriched with cvText/candidateName/
// level. CV download/parse failures (VisualCV profile deleted/renamed,
// pdf-parse chokes on some PDFs) only affect enrichment — the candidate is
// never hidden because of them. See docs/fix-pipeline-candidates-plan.md.

import { prisma } from '../db/prisma';
import { extractCVText, extractNameFromCV, detectLevelFromCV } from './cv.service';
import { describeError } from '../utils/errorLogger';

const VISUALCV_HOST = 'my.visualcv.com';

// VisualCV slugs follow "firstname_lastinitial_role..." (e.g.
// "vladimir_v_lead_sap_sd_mm_consultant" -> "Vladimir V"). When the profile
// itself can't be fetched — confirmed by hand: some of these links are
// genuinely dead (404 even from a plain browser-UA curl, not a bot block) —
// this gives the candidate a plausible name instead of a blank one, matching
// the "Firstname L." style already used elsewhere in the UI for privacy.
function deriveNameFromVisualCvSlug(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== VISUALCV_HOST) return null;

  const slug = parsed.pathname.split('/').filter(Boolean).pop();
  if (!slug) return null;

  const tokens = slug.split('_').filter(Boolean).slice(0, 2);
  if (tokens.length === 0) return null;

  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return tokens.map(titleCase).join(' ');
}

interface UpsertPipelineCandidateInput {
  issueId: string;
  rootCommentId: string;
  cvUrl: string;
  role?: string | null;
  clientName?: string | null;
  // Только для бэкфилла: время исходного комментария с резюме. Без него все
  // добэкфилленные карточки схлопнулись бы в дату прогона скрипта и сломали
  // сортировку и фильтр по датам в пайплайне. На update не применяется.
  cvSubmittedAt?: Date;
}

interface UpsertPipelineCandidateResult {
  created: boolean;
  enriched: boolean;
  // Отличает «резюме не скачалось/не распарсилось» от «не смогли записать строку».
  // Только в первом случае имеет смысл писать в Linear, что ссылка нечитаема.
  cvUnreadable: boolean;
}

export async function upsertPipelineCandidateFromCv(
  input: UpsertPipelineCandidateInput,
): Promise<UpsertPipelineCandidateResult> {
  const { issueId, rootCommentId, cvUrl, role, clientName, cvSubmittedAt } = input;

  let existing: { id: string } | null;
  try {
    existing = await prisma.pipelineCandidate.findUnique({
      where: { rootCommentId },
      select: { id: true },
    });

    await prisma.pipelineCandidate.upsert({
      where: { rootCommentId },
      create: {
        linearIssueId: issueId,
        rootCommentId,
        cvUrl,
        role: role ?? undefined,
        clientName: clientName ?? undefined,
        cvSubmittedAt: cvSubmittedAt ?? undefined,
      },
      update: { cvUrl },
    });
  } catch (err) {
    console.warn('[pipeline-candidate] failed to create/update base row', { rootCommentId, ...describeError(err) });
    return { created: false, enriched: false, cvUnreadable: false };
  }

  try {
    const cvText = await extractCVText(cvUrl);
    const [candidateName, level] = await Promise.all([
      extractNameFromCV(cvText),
      detectLevelFromCV(cvText),
    ]);

    await prisma.pipelineCandidate.update({
      where: { rootCommentId },
      data: {
        cvText,
        candidateName: candidateName ?? deriveNameFromVisualCvSlug(cvUrl) ?? undefined,
        level: level ?? undefined,
      },
    });

    return { created: !existing, enriched: true, cvUnreadable: false };
  } catch (err) {
    console.warn('[pipeline-candidate] enrichment failed', { rootCommentId, ...describeError(err) });

    const fallbackName = deriveNameFromVisualCvSlug(cvUrl);
    if (fallbackName) {
      await prisma.pipelineCandidate.update({
        where: { rootCommentId },
        data: { candidateName: fallbackName },
      }).catch(() => {});
    }

    return { created: !existing, enriched: false, cvUnreadable: true };
  }
}
