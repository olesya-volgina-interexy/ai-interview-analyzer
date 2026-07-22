// Recovers PipelineCandidate rows for candidates whose CV (VisualCV link or
// file attachment) was posted on a Linear root comment before the fix in
// upsertPipelineCandidateFromCv existed — back then, a CV download/parse
// failure meant the row was never created at all, so the candidate silently
// never showed up in the "In Pipeline" tab. See docs/fix-pipeline-candidates-plan.md.
//
// Idempotent — safe to re-run. Skips any root comment that already has a
// PipelineCandidate row.
//
// Usage:
//   pnpm --filter @app/api backfill:pipeline           # apply
//   pnpm --filter @app/api backfill:pipeline --dry-run # report only, no writes

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { prisma } from '../db/prisma';
import { getIssueComments, getComment } from '../services/linear.service';
import { extractCvUrlFromComment, extractCvAttachmentFromBodyData } from '../services/linear.parser';
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
    if (!detail) return null;
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
  let rootCommentsScanned = 0;
  let alreadyExisted = 0;
  let created = 0;
  let enriched = 0;
  let notEnriched = 0;
  let issuesFailed = 0;

  for (const issueId of issueIds) {
    issuesScanned++;
    try {
      const [comments, req] = await Promise.all([
        getIssueComments(issueId),
        prisma.incomingRequest.findUnique({
          where: { linearIssueId: issueId },
          select: { role: true, clientName: true },
        }),
      ]);

      const rootComments = comments.filter(c => !c.parent?.id && !c.body.includes('Possible CV mismatch'));

      for (const root of rootComments) {
        rootCommentsScanned++;

        if (existingRootCommentIds.has(root.id)) {
          alreadyExisted++;
          continue;
        }

        const cvUrl = await resolveCvUrl(root.body, root.id);
        if (!cvUrl) continue;

        if (DRY_RUN) {
          console.log(`  + would create: issue=${issueId} comment=${root.id} cvUrl=${cvUrl}`);
          created++;
          continue;
        }

        const result = await upsertPipelineCandidateFromCv({
          issueId,
          rootCommentId: root.id,
          cvUrl,
          role: req?.role,
          clientName: req?.clientName,
        });
        if (result.created) {
          created++;
          if (result.enriched) enriched++; else notEnriched++;
          console.log(`  ✅ created ${root.id} (issue ${issueId})${result.enriched ? '' : ' — name/level not enriched'}`);
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
    `${rootCommentsScanned} root comments checked, ${alreadyExisted} already had a row, ` +
    `${created} ${DRY_RUN ? 'would be created' : 'created'} (${enriched} enriched, ${notEnriched} not enriched)`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
