import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { prisma } from '../db/prisma';
import { getIssueStatusHistory } from '../services/linear.service';
import { reconcileStatusHistory } from '../db/db.service';
import { invalidateStatsCache } from '../services/statsCache';

// Surfaces unknown-workflow-state warnings from resolveStage on the console,
// same intent as fastify.log.warn in the live webhook path — this script has
// no fastify logger, but an unmapped Linear state should still be loud here.
const consoleLogger = { warn: (obj: Record<string, unknown>, msg: string) => console.warn(`⚠️  ${msg}`, obj) };

// One-off backfill: replaces every tracked request's local status history
// with the authoritative timeline from Linear. Run this once after deploying
// the time-on-stage fix (see docs/fix-time-on-stages-plan.md, RC-3) so
// historical dwell/skip/regression stats aren't still missing transitions
// that a dropped or desynced webhook never wrote locally.
async function main() {
  console.log('🚀 Starting status-history reconciliation from Linear...');

  const requests = await prisma.incomingRequest.findMany({
    where: { linearIssueId: { not: null } },
    select: { linearIssueId: true },
  });

  console.log(`📋 Found ${requests.length} tracked requests`);

  let success = 0;
  let empty = 0;
  let failed = 0;

  for (const { linearIssueId } of requests) {
    const issueId = linearIssueId!;
    try {
      const history = await getIssueStatusHistory(issueId, consoleLogger);
      if (history.length === 0) {
        console.log(`⚠️  ${issueId} → no workflow-state history in Linear, skipped`);
        empty++;
      } else {
        await reconcileStatusHistory(issueId, history);
        console.log(`✅ ${issueId} → ${history.length} transitions reconciled`);
        success++;
      }

      // Пауза чтобы не перегружать Linear API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`❌ Failed to reconcile ${issueId}:`, err);
      failed++;
    }
  }

  console.log(`\n📊 Reconciliation complete: ${success} updated, ${empty} empty, ${failed} failed`);

  await invalidateStatsCache();
  console.log('🧹 Stats cache invalidated');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
