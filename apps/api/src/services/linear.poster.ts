import { postReply } from './linear.service';
import type { ManagerCallAnalysis, TechnicalAnalysis } from '@shared/schemas';
import { describeError } from '../utils/errorLogger';

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