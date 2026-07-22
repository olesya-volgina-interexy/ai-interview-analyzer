// apps/api/src/services/bluedot.service.ts

import pdfParse from 'pdf-parse';
import puppeteer from 'puppeteer';
import { sanitizePdfText, assertExtractedTextPlausible } from '../utils/pdfUtils';
import { stripNullBytes } from '../utils/textSanitize';
import { assertPublicHttpUrl, isExactHost, safeAxios as axios } from '../utils/ssrf';

const BLUEDOT_PREVIEW_RE = /bluedothq\.com\/preview\//i;
const LINEAR_UPLOAD_HOST = 'uploads.linear.app';

// Сериализуем запуски браузера — на случай если несколько job'ов
// пытаются открыть сессию одновременно (concurrency=3 в воркере).
let chromeLock: Promise<unknown> = Promise.resolve();
function withChromeLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = chromeLock;
  let release!: () => void;
  const next = new Promise<void>(r => { release = r; });
  chromeLock = next;
  return prev.then(() => fn()).finally(() => release());
}

// ── Главная функция ───────────────────────────────────────────────────────

export async function fetchTranscript(urlOrPdf: string): Promise<string> {
  const url = urlOrPdf.trim();

  await assertPublicHttpUrl(url);

  if (isPdfUrl(url)) {
    return fetchPdfTranscript(url);
  }

  // Linear upload URLs end in a UUID, not ".pdf", so isPdfUrl() misses them.
  // Fetch the bytes and detect the real type by content (magic bytes /
  // Content-Type) instead of trusting the URL extension.
  if (isExactHost(url, LINEAR_UPLOAD_HOST)) {
    return fetchUploadByContent(url, true);
  }

  if (isTextFile(url)) {
    return fetchRawText(url);
  }

  if (BLUEDOT_PREVIEW_RE.test(url)) {
    return fetchBluedotPreview(url);
  }

  return fetchRawText(url);
}

// ── Bluedot preview — Remote или Local браузер ────────────────────────────

async function fetchBluedotPreview(url: string): Promise<string> {
  return withChromeLock(() => fetchBluedotPreviewInner(url));
}

async function fetchBluedotPreviewInner(url: string): Promise<string> {
  // Если задан BROWSER_WS_ENDPOINT — подключаемся к удалённому браузеру
  // (Browserless, Chrome Cloud и т.д.). Иначе — запускаем локальный Chrome.
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;

  const browser = wsEndpoint
    ? await puppeteer.connect({ browserWSEndpoint: wsEndpoint })
    : await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH,
        pipe: true,
        timeout: 60_000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
      });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await page.waitForFunction(
      () => document.body.innerText.includes('Transcript'),
      { timeout: 60_000, polling: 500 }
    ).catch(() => { /* пойдём дальше — вдруг вкладка уже активна */ });

    await page.evaluate(() => {
      if (document.body.innerText.includes('Speaker:')) return;
      const candidates = Array.from(
        document.querySelectorAll('button, a, div, span, [role="tab"], li')
      ) as HTMLElement[];
      const tab = candidates.find(el => el.innerText?.trim() === 'Transcript');
      if (tab) tab.click();
    });

    try {
      await page.waitForFunction(
        () => {
          const t = document.body.innerText;
          return t.includes('Speaker:') || t.length > 5000;
        },
        { timeout: 90_000, polling: 500 }
      );
    } catch (waitErr) {
      const diag = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        htmlLength: document.documentElement.outerHTML.length,
        bodyTextLength: document.body.innerText.length,
        bodyPreview: document.body.innerText.slice(0, 500),
        iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src).slice(0, 5),
      })).catch(() => null);
      console.error('[stage:bluedot] page content wait timed out', { sourceUrl: url, diag });
      throw waitErr;
    }

    const raw = await page.evaluate(() => document.body.innerText);
    const extracted = extractTranscriptSection(raw);

    if (!extracted || extracted.length < 50) {
      throw new Error('Transcript section is empty or too short');
    }

    return extracted;
  } finally {
    // При remote-подключении disconnect() отключает клиента, не убивая браузер.
    // При локальном — close() завершает процесс Chrome.
    if (wsEndpoint) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }
}

// ── Вырезать секцию транскрипции из полного текста страницы ──────────────

function extractTranscriptSection(raw: string): string {
  // Strip null bytes that Puppeteer/Chrome can embed in extracted innerText —
  // Postgres rejects them in TEXT columns and they confuse the LLM tokenizer.
  const lines = stripNullBytes(raw).split('\n').map(l => l.trim()).filter(Boolean);

  const transcriptTabIdx = lines.findIndex(l =>
    /^transcript$/i.test(l)
  );

  const contentLines = transcriptTabIdx !== -1
    ? lines.slice(transcriptTabIdx + 1)
    : lines;

  const noisePatterns = [
    /^AI chat$/i,
    /^Search transcript$/i,
    /^Russian$/i,
    /^English$/i,
    /^Copy$/i,
    /^Share$/i,
    /^Download$/i,
    /^Return to Current Position$/i,
    /^Copy transcript$/i,
    /^Insights$/i,
  ];

  const cleaned = contentLines.filter(line =>
    !noisePatterns.some(re => re.test(line)) &&
    line.length > 1
  );

  return cleaned.join('\n');
}

// ── PDF транскрипция ──────────────────────────────────────────────────────

async function fetchPdfTranscript(url: string): Promise<string> {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  return parsePdfBuffer(Buffer.from(res.data), url);
}

// Parse + sanitize a downloaded PDF buffer. Shared by the .pdf-URL path and the
// content-sniffing Linear-upload path.
async function parsePdfBuffer(buffer: Buffer, url: string): Promise<string> {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err: any) {
    throw new Error(`PDF_PARSE_FAILED: ${url} — ${err?.message ?? 'unknown error'}`);
  }

  const text = sanitizePdfText(parsed.text);

  if (!text) throw new Error(`PDF transcript is empty: ${url}`);
  assertExtractedTextPlausible(text, buffer.length, url);
  return text;
}

// Download bytes and decide PDF-vs-text by the actual content, not the URL
// extension. Linear upload URLs have no extension, and the same endpoint can
// serve PDF, txt, or docx. Detect PDFs by the "%PDF-" magic bytes (and the
// Content-Type as a secondary signal) so they get proper text extraction
// instead of being stored as raw binary.
async function fetchUploadByContent(url: string, withLinearAuth: boolean): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
  if (withLinearAuth && process.env.LINEAR_API_KEY && isExactHost(url, LINEAR_UPLOAD_HOST)) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers,
  });

  const buffer = Buffer.from(res.data);
  const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
  const isPdf =
    buffer.subarray(0, 5).toString('latin1') === '%PDF-' ||
    contentType.includes('application/pdf');

  if (isPdf) {
    return parsePdfBuffer(buffer, url);
  }

  return stripNullBytes(buffer.toString('utf-8'));
}

// ── Fallback ──────────────────────────────────────────────────────────────

async function fetchRawText(url: string): Promise<string> {
  const res = await axios.get(url, { timeout: 30_000 });
  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return stripNullBytes(raw);
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url) || url.includes('application/pdf');
}

function isTextFile(url: string): boolean {
  return /\.(txt|docx?)(\?.*)?$/i.test(url);
}