import { postReply } from './linear.service';
import type { ManagerCallAnalysis, TechnicalAnalysis } from '@shared/schemas';
import { describeError } from '../utils/errorLogger';


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
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг технического анализа ──────────────────────────────────────────

export async function postTechnicalAnalysis(
  issueId: string,
  parentCommentId: string,
  analysis: TechnicalAnalysis,
  matchedVacancyTitle?: string,
): Promise<void> {
  const vacancyNote = matchedVacancyTitle
    ? `\n_Evaluated against: **${matchedVacancyTitle}**_\n`
    : '';

  const declaredNotAssessed = analysis.cvMatch.declaredSkills
    .filter(
      (s) =>
        !analysis.cvMatch.confirmedSkills.includes(s) &&
        !analysis.cvMatch.unconfirmedSkills.includes(s),
    )
    .join(', ');

  const body = `
## Technical Call Analysis
${vacancyNote}
**Recommendation:** ${analysis.recommendation.toUpperCase()}
**Level:** ${analysis.technicalLevel ?? '—'}
**Score:** ${analysis.score}/100

### CV Match — ${analysis.cvMatch.cvMatchScore}%
- Confirmed: ${analysis.cvMatch.confirmedSkills.join(', ') || '—'}
- Not confirmed: ${analysis.cvMatch.unconfirmedSkills.join(', ') || '—'}
- Declared, not tested: ${declaredNotAssessed || '—'}

### Broker Match — ${analysis.brokerRequestMatch.brokerMatchScore}%
- Covered: ${analysis.brokerRequestMatch.coveredRequirements.join(', ') || '—'}
- Missing: ${analysis.brokerRequestMatch.missingRequirements.join(', ') || '—'}
- Not assessed: ${(analysis.brokerRequestMatch.notAssessedRequirements ?? []).join(', ') || '—'}

### Role Fit
${analysis.roleFitSummary}
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг финального анализа ────────────────────────────────────────────

export async function postFinalResult(
  issueId: string,
  parentCommentId: string,
  analysis: any,
  decision: 'hired' | 'lost'
): Promise<void> {
  const body = `
## Final Result

**Decision:** ${decision.toUpperCase()}

### Why ${decision === 'hired' ? 'Hired' : 'Rejected'}
${analysis.reasoning}

### Recommendation
${analysis.recommendation}
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}