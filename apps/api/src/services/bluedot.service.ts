import axios from 'axios';

// Скачать транскрипцию по ссылке из Bluedot
export async function fetchTranscriptFromUrl(url: string): Promise<string> {
  try {
    const res = await axios.get(url, { timeout: 30000 });
    return typeof res.data === 'string'
      ? res.data
      : JSON.stringify(res.data);
  } catch (err) {
    throw new Error(`Failed to fetch Bluedot transcript: ${url}`);
  }
}