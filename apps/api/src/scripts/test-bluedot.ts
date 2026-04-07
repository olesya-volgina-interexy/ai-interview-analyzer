// apps/api/scripts/test-bluedot.ts
// Запуск: npx tsx scripts/test-bluedot.ts

import { fetchTranscript } from '../services/bluedot.service';

const TEST_CASES = [
  {
    label: 'Bluedot preview link',
    url: 'https://app.bluedothq.com/preview/69d506193a9507cdc737cf1b',
  },
  // Раскомментируй если есть PDF:
  // { label: 'PDF transcript', url: 'https://example.com/transcript.pdf' },
];

async function main() {
  for (const { label, url } of TEST_CASES) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Testing: ${label}`);
    console.log(`URL: ${url}`);

    try {
      const text = await fetchTranscript(url);
      console.log(`✅ Success — ${text.length} chars`);
      console.log('Preview (first 10000 chars):');
      console.log(text.slice(0, 10000));
    } catch (err: any) {
      console.error(`❌ Failed: ${err.message}`);
    }
  }
}

main();