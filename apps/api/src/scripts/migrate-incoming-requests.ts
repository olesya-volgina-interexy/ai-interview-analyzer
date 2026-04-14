import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { prisma } from '../db/prisma';
import { parseIssue } from '../services/linear.parser';

const STATUS_MAP: Record<string, string> = {
  "Broker's Call": 'manager_call',
  'Tech Call': 'technical',
  'Hired': 'hired',
  'Lost': 'rejected',
  'On Hold': 'on_hold',
  'Backlog': 'new',
  'Todo': 'new',
  'In Progress': 'in_progress',
};

async function main() {
  console.log('🚀 Starting migration of historical Linear issues...');

  // Получаем все уникальные linearIssueId из существующих интервью
  const existingInterviews = await prisma.interview.findMany({
    where: { linearIssueId: { not: null } },
    select: { linearIssueId: true, createdAt: true },
    distinct: ['linearIssueId'],
  });

  console.log(`📋 Found ${existingInterviews.length} unique Linear issues in interviews`);

  // Проверяем какие уже есть в IncomingRequest
  const existingRequests = await prisma.incomingRequest.findMany({
    select: { linearIssueId: true },
  });
  const existingIds = new Set(existingRequests.map(r => r.linearIssueId));

  const toMigrate = existingInterviews.filter(
    i => i.linearIssueId && !existingIds.has(i.linearIssueId)
  );

  console.log(`⚡ ${toMigrate.length} issues need migration (${existingIds.size} already exist)`);

  if (toMigrate.length === 0) {
    console.log('✅ Nothing to migrate');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const interview of toMigrate) {
    const issueId = interview.linearIssueId!;
    try {
      // Парсим issue из Linear
      const parsed = await parseIssue(issueId);

      // Определяем статус на основе текущего статуса в Linear
      const status = STATUS_MAP[parsed.status] ?? 'in_progress';

      await prisma.incomingRequest.upsert({
        where: { linearIssueId: issueId },
        create: {
          linearIssueId: issueId,
          clientName: parsed.clientName ?? undefined,
          role: parsed.role ?? undefined,
          brokerRequest: parsed.brokerRequest ?? undefined,
          status,
          receivedAt: interview.createdAt, // используем дату первого интервью
        },
        update: {
          clientName: parsed.clientName ?? undefined,
          role: parsed.role ?? undefined,
          status,
        },
      });

      console.log(`✅ ${issueId} → ${parsed.clientName ?? '?'} / ${parsed.role} / ${status}`);
      success++;

      // Пауза чтобы не перегружать Linear API
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.error(`❌ Failed to migrate ${issueId}:`, err);
      failed++;
    }
  }

  console.log(`\n📊 Migration complete: ${success} success, ${failed} failed`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());