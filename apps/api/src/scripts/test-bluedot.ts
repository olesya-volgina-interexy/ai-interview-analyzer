import { fetchTranscriptFromUrl } from '../services/bluedot.service';

async function main() {
  const url = 'https://app.bluedothq.com/preview/69c3f5079b3f4205c46e60c7';

  const html = await fetchTranscriptFromUrl(url);

  // Ищем JSON данные внутри HTML (Next.js часто хранит данные в __NEXT_DATA__)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (nextDataMatch) {
    const nextData = JSON.parse(nextDataMatch[1]);
    console.log('NEXT_DATA keys:', Object.keys(nextData));
    console.log('props keys:', Object.keys(nextData.props ?? {}));
    console.log(JSON.stringify(nextData.props, null, 2).slice(0, 2000));
  } else {
    console.log('No NEXT_DATA found');

    // Попробуем найти текст транскрипции напрямую
    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('Plain text (first 1000):', bodyText.slice(0, 1000));
  }
}

main().catch(console.error);