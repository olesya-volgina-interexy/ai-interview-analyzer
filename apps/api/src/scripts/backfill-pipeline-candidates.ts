// Recovers PipelineCandidate rows for candidates whose CV (VisualCV link or
// file attachment) never produced one. Two historical causes: a CV download/parse
// failure meant the row was never created at all (see
// docs/fix-pipeline-candidates-plan.md), and CVs posted in reply comments were
// skipped by the webhook entirely (see CV-IN-REPLIES-PLAN.md). Either way the
// candidate silently never showed up in the "In Pipeline" tab.
//
// Scans every comment — root or reply — and keys each row on the id of the
// comment that carried the CV, exactly as the webhook does.
//
// Idempotent — safe to re-run. Skips any comment that already has a
// PipelineCandidate row; never overwrites an existing one.
//
// Does NOT reconstruct IncomingRequest.cvSentCount — that is an
// increment-on-webhook counter with no per-CV rows to rebuild from, so historical
// funnel numbers stay as they are.
//
// Usage:
//   pnpm --filter @app/api backfill:pipeline           # apply
//   pnpm --filter @app/api backfill:pipeline --dry-run # report only, no writes

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { prisma } from '../db/prisma';
import { getIssueComments, getComment, getIssueData, isOwnCommentBody } from '../services/linear.service';
import { extractCvUrlFromComment, extractCvAttachmentFromBodyData, hasStageHashtag } from '../services/linear.parser';
import { upsertPipelineCandidateFromCv } from '../services/pipelineCandidate.service';

const DRY_RUN = process.argv.includes('--dry-run');
const ISSUE_PAUSE_MS = 300;

async function resolveCvUrl(body: string, commentId: string): Promise<string | null> {
  const inline = extractCvUrlFromComment(body);
  if (inline) return inline;

  // File attachments aren't in the comment body returned by getIssueComments —
  // only in bodyData, fetched per-comment (same as the webhook handler).
  try {
    const detail = await getComment(commentId);
    if (!detail || isOwnCommentBody(detail.body) || hasStageHashtag(detail.body)) return null;
    return extractCvUrlFromComment(detail.body) ?? extractCvAttachmentFromBodyData(detail.bodyData);
  } catch (err) {
    console.warn(`  ⚠️  failed to fetch comment detail for ${commentId}:`, err);
    return null;
  }
}

async function main() {
  console.log(`🚀 Starting PipelineCandidate backfill${DRY_RUN ? ' (dry run)' : ''}...`);

  const [requestIssues, interviewIssues, existingCandidates] = await Promise.all([
    prisma.incomingRequest.findMany({
      where: { linearIssueId: { not: null } },
      select: { linearIssueId: true },
    }),
    prisma.interview.findMany({
      where: { linearIssueId: { not: null } },
      select: { linearIssueId: true },
      distinct: ['linearIssueId'],
    }),
    prisma.pipelineCandidate.findMany({ select: { rootCommentId: true } }),
  ]);

  const issueIds = Array.from(new Set(
    [...requestIssues, ...interviewIssues]
      .map(r => r.linearIssueId)
      .filter((id): id is string => !!id),
  ));
  const existingRootCommentIds = new Set(existingCandidates.map(c => c.rootCommentId));

  console.log(`📋 ${issueIds.length} known Linear issues to scan, ${existingRootCommentIds.size} PipelineCandidate rows already exist`);

  let issuesScanned = 0;
  let commentsScanned = 0;
  let alreadyExisted = 0;
  let created = 0;
  let createdFromReplies = 0;
  let enriched = 0;
  let notEnriched = 0;
  let issuesFailed = 0;

  for (const issueId of issueIds) {
    issuesScanned++;
    try {
      // IncomingRequest у старых тикетов часто без role/clientName (событие
      // Issue/create по ним никогда не приходило) — фолбэк на заголовок тикета,
      // тот же источник, из которого роль берёт анализ.
      const [comments, req, issueData] = await Promise.all([
        getIssueComments(issueId),
        prisma.incomingRequest.findUnique({
          where: { linearIssueId: issueId },
          select: { role: true, clientName: true },
        }),
        getIssueData(issueId).catch(() => null),
      ]);

      // Root и реплаи равноправны: карточка привязана к тому комментарию, в
      // котором лежало резюме. Стадийные комментарии отбрасываем — приложенный
      // файлом транскрипт неотличим от CV по формату ссылки.
      const candidateComments = comments.filter(
        c => !isOwnCommentBody(c.body) && !hasStageHashtag(c.body),
      );

      for (const comment of candidateComments) {
        commentsScanned++;
        const isReply = !!comment.parent?.id;

        if (existingRootCommentIds.has(comment.id)) {
          alreadyExisted++;
          continue;
        }

        const cvUrl = await resolveCvUrl(comment.body, comment.id);
        if (!cvUrl) continue;

        if (DRY_RUN) {
          console.log(`  + would create: issue=${issueId} comment=${comment.id}${isReply ? ' (reply)' : ''} cvUrl=${cvUrl}`);
          created++;
          if (isReply) createdFromReplies++;
          continue;
        }

        const result = await upsertPipelineCandidateFromCv({
          issueId,
          rootCommentId: comment.id,
          cvUrl,
          role: req?.role ?? issueData?.role,
          clientName: req?.clientName ?? issueData?.clientName,
          cvSubmittedAt: new Date(comment.createdAt),
        });
        if (result.created) {
          created++;
          if (isReply) createdFromReplies++;
          if (result.enriched) enriched++; else notEnriched++;
          console.log(`  ✅ created ${comment.id}${isReply ? ' (reply)' : ''} (issue ${issueId})${result.enriched ? '' : ' — name/level not enriched'}`);
        }
      }
    } catch (err) {
      issuesFailed++;
      console.error(`❌ Failed to scan issue ${issueId}:`, err);
    }

    await new Promise(r => setTimeout(r, ISSUE_PAUSE_MS));
  }

  console.log(
    `\n📊 Backfill complete: ${issuesScanned} issues scanned (${issuesFailed} failed), ` +
    `${commentsScanned} comments checked, ${alreadyExisted} already had a row, ` +
    `${created} ${DRY_RUN ? 'would be created' : 'created'} ` +
    `(${createdFromReplies} from replies, ${created - createdFromReplies} from root comments` +
    `${DRY_RUN ? '' : `, ${enriched} enriched, ${notEnriched} not enriched`})`
  );
  console.log('ℹ️  cvSentCount not touched — historical funnel numbers are unchanged.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
