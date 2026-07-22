import { postReply } from './linear.service';
import type { ManagerCallAnalysis, TechnicalAnalysis } from '@shared/schemas';
import { describeError } from '../utils/errorLogger';
import { redis } from '../db/redis';

// Ссылка на детальный анализ кандидата на нашем фронте.
// Возвращает '' если нет имени кандидата или не задан WEB_APP_URL — тогда коммент остаётся без ссылки.
function buildAnalysisLink(candidateName?: string): string {
  const base = process.env.WEB_APP_URL?.replace(/\/+$/, '');
  if (!base || !candidateName) return '';
  return `\n\n---\n[View detailed analysis](${base}/candidates/${encodeURIComponent(candidateName)})`;
}


async function postReplyWithRetry(
  issueId: string,
  parentCommentId: string,
  body: string,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await postReply(issueId, parentCommentId, body);
      return;
    } catch (err: any) {
      lastError = err;

      const isRetriable =
        err.message?.includes('fetch failed') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('ECONNRESET') ||
        err.type === 'Unknown' ||
        err.status === 429 ||
        err.status >= 500;

      if (!isRetriable || attempt === maxRetries) {
        console.error('[stage:linear] postReply non-retriable / exhausted', {
          ...describeError(err),
          issueId,
          parentCommentId,
          attempt,
          maxRetries,
        });
        throw err;
      }

      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn('[stage:linear] postReply failed, retrying', {
        ...describeError(err),
        issueId,
        parentCommentId,
        attempt,
        maxRetries,
        retryInMs: delay,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ── Постинг анализа менеджер-колла ────────────────────────────────────────

export async function postManagerCallAnalysis(
  issueId: string,
  parentCommentId: string,
  analysis: ManagerCallAnalysis,
  matchedVacancyTitle?: string,
  candidateName?: string,
): Promise<void> {
  const vacancyNote = matchedVacancyTitle
    ? `\n_Evaluated against: **${matchedVacancyTitle}**_\n`
    : '';

  const body = `
## Manager Call Analysis
${vacancyNote}
**Result:** ${analysis.stageResult.toUpperCase()}

### Broker Soft Fit
- Covered: ${analysis.brokerSoftFit.coveredRequirements.join(', ') || '—'}
- Missing: ${analysis.brokerSoftFit.missingRequirements.join(', ') || '—'}
- ${analysis.brokerSoftFit.fitSummary}

### Recommendation
${analysis.recommendation}
`.trim() + buildAnalysisLink(candidateName);

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг технического анализа ──────────────────────────────────────────

export async function postTechnicalAnalysis(
  issueId: string,
  parentCommentId: string,
  analysis: TechnicalAnalysis,
  matchedVacancyTitle?: string,
  candidateName?: string,
): Promise<void> {
  const vacancyNote = matchedVacancyTitle
    ? `\n_Evaluated against: **${matchedVacancyTitle}**_\n`
    : '';

  const body = `
## Technical Call Analysis
${vacancyNote}
**Recommendation:** ${analysis.recommendation.toUpperCase()}
**Level:** ${analysis.technicalLevel ?? '—'}
**Score:** ${analysis.score}/100

**CV Match — ${analysis.cvMatch.cvMatchScore}%**
**Broker Match — ${analysis.brokerRequestMatch.brokerMatchScore}%**

### Role Fit
${analysis.roleFitSummary}
`.trim() + buildAnalysisLink(candidateName);

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг финального анализа ────────────────────────────────────────────

export async function postFinalResult(
  issueId: string,
  parentCommentId: string,
  analysis: any,
  decision: 'hired' | 'lost',
  candidateName?: string,
): Promise<void> {
  const body = `
## Final Result

**Decision:** ${decision.toUpperCase()}

### Why ${decision === 'hired' ? 'Hired' : 'Rejected'}
${analysis.reasoning}

### Recommendation
${analysis.recommendation}
`.trim() + buildAnalysisLink(candidateName);

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг уведомлений об ошибках анализа ────────────────────────────────
// Раньше сбои пайплайна (битая ссылка на транскрипт/CV, упавший LLM/DB/Qdrant,
// неудачный постинг результата) просто логировались на сервере — пользователь
// в Linear никак не узнавал, что анализ не прошёл. Эти функции закрывают
// пробел: понятный коммент в тред кандидата с тем, что случилось и что делать.

export type FailureStage =
  | 'transcript' | 'cv' | 'feedback' | 'llm' | 'embed' | 'rag' | 'qdrant' | 'db'
  | 'linear' | 'no-data' | 'unknown';

const FAILURE_GUIDANCE: Record<FailureStage, string> = {
  transcript:
    "Couldn't fetch the interview transcript from the linked recording — the link may be broken, expired, or the recording may still be processing.\n\n" +
    '**What to do:** Edit the transcript-link comment in place with a working link. Analysis will automatically retry once you save the edit.',
  cv:
    "Couldn't read the candidate's CV — the link may be broken or the file format isn't supported (PDF, DOC, DOCX, TXT).\n\n" +
    '**What to do:** Edit the CV comment with a working file/link. The analysis proceeded without CV context in the meantime — it will pick up the CV once fixed and re-triggered.',
  feedback:
    'The manager feedback for this call looks too short or empty to analyze meaningfully.\n\n' +
    '**What to do:** Edit the #feedback_manager_call comment in place with more detail (a sentence or two on how the candidate did). Analysis will automatically retry once you save the edit.',
  llm:
    'The AI analysis service failed while processing this candidate — usually a transient issue with the model provider.\n\n' +
    '**What to do:** No changes needed here. Ping engineering if this keeps failing after a couple of retries.',
  embed:
    'An internal error occurred while preparing this candidate for similar-case matching.\n\n' +
    '**What to do:** Ping engineering with a link to this ticket — this isn\'t fixable from Linear.',
  rag:
    'An internal error occurred while matching this candidate against similar past interviews.\n\n' +
    '**What to do:** Ping engineering with a link to this ticket — this isn\'t fixable from Linear.',
  qdrant:
    'An internal error occurred while matching this candidate against similar past interviews.\n\n' +
    '**What to do:** Ping engineering with a link to this ticket — this isn\'t fixable from Linear.',
  db:
    'An internal error occurred while saving this analysis.\n\n' +
    '**What to do:** Ping engineering with a link to this ticket — this isn\'t fixable from Linear.',
  linear:
    'The analysis completed, but posting the full result back to this thread failed.\n\n' +
    '**What to do:** Ping engineering with a link to this ticket to retrieve the result — the analysis exists, it just couldn\'t be posted here.',
  'no-data':
    'No manager-call or technical-call analysis was found for this candidate, so the final result summary was skipped.\n\n' +
    '**What to do:** Make sure the manager/technical call analysis completed (look for an analysis comment above) before adding #hired or #lost. If a call was analyzed elsewhere, ping engineering.',
  unknown:
    "Something went wrong while analyzing this candidate and it couldn't be completed.\n\n" +
    "**What to do:** Ping engineering with a link to this ticket — they'll have the error details.",
};

async function postAnalysisFailureNotice(
  issueId: string,
  parentCommentId: string,
  opts: { stageLabel: string; failureStage: FailureStage; detail?: string },
): Promise<void> {
  const guidance = FAILURE_GUIDANCE[opts.failureStage] ?? FAILURE_GUIDANCE.unknown;
  const body = [
    `⚠️ **Analysis failed — ${opts.stageLabel}**`,
    '',
    guidance,
    opts.detail ? `\n> ${opts.detail}` : '',
    '',
    '_This is an automated message._',
  ].filter(Boolean).join('\n');

  try {
    await postReplyWithRetry(issueId, parentCommentId, body);
  } catch (err) {
    console.error('[linear] Failed to post analysis-failure notice (giving up)', {
      ...describeError(err),
      issueId,
      parentCommentId,
      failureStage: opts.failureStage,
    });
  }
}

// Throttleнутая через Redis обёртка — не даём одному и тому же сбою (issue +
// комментарий + стадия) спамить одинаковый коммент при каждой переоценке
// тикета (новый комментарий/смена статуса), пока проблема не исправлена.
export async function postAnalysisFailureNoticeOnce(
  issueId: string,
  parentCommentId: string,
  opts: { stageLabel: string; failureStage: FailureStage; detail?: string },
): Promise<void> {
  const key = `analysis-failure-notice:${issueId}:${parentCommentId}:${opts.failureStage}`;
  const isNew = await redis.set(key, '1', 'EX', 2 * 3600, 'NX');
  if (!isNew) return;
  await postAnalysisFailureNotice(issueId, parentCommentId, opts);
}