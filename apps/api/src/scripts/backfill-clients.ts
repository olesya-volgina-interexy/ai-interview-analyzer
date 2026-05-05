import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { prisma } from '../db/prisma';

async function main() {
  console.log('🚀 Starting Client backfill...');

  const [interviewRows, requestRows, candidateRows] = await Promise.all([
    prisma.interview.findMany({
      where: { clientName: { not: null } },
      select: { clientName: true },
      distinct: ['clientName'],
    }),
    prisma.incomingRequest.findMany({
      where: { clientName: { not: null } },
      select: { clientName: true },
      distinct: ['clientName'],
    }),
    prisma.pipelineCandidate.findMany({
      where: { clientName: { not: null } },
      select: { clientName: true },
      distinct: ['clientName'],
    }),
  ]);

  const allNames = [...interviewRows, ...requestRows, ...candidateRows]
    .map(r => r.clientName?.trim())
    .filter((n): n is string => !!n && n.length > 0);

  const unique = Array.from(new Set(allNames));

  console.log(
    `📋 Found ${unique.length} unique client names ` +
    `(interviews: ${interviewRows.length}, requests: ${requestRows.length}, candidates: ${candidateRows.length})`
  );

  if (unique.length === 0) {
    console.log('✅ Nothing to backfill');
    return;
  }

  // Снимок существующих клиентов — чтобы посчитать created vs existed
  const existing = await prisma.client.findMany({ select: { name: true } });
  const existingSet = new Set(existing.map(c => c.name));

  let created = 0;
  let existed = 0;
  let failed = 0;

  for (const name of unique) {
    try {
      await prisma.client.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      if (existingSet.has(name)) {
        existed++;
        console.log(`= ${name} (already existed)`);
      } else {
        created++;
        console.log(`✅ ${name} (created)`);
      }
    } catch (err) {
      console.error(`❌ Failed to upsert "${name}":`, err);
      failed++;
    }
  }

  console.log(
    `\n📊 Backfill complete: ${created} created, ${existed} already existed, ${failed} failed`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());