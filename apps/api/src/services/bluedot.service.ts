// apps/api/src/services/bluedot.service.ts

import axios from 'axios';
import pdfParse from 'pdf-parse';
import puppeteer from 'puppeteer';
import { sanitizePdfText, assertExtractedTextPlausible } from '../utils/pdfUtils';
import { stripNullBytes } from '../utils/textSanitize';

const BLUEDOT_PREVIEW_RE = /bluedothq\.com\/preview\//i;
const LINEAR_UPLOAD_RE = /uploads\.linear\.app\//i;

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

  if (isPdfUrl(url)) {
    return fetchPdfTranscript(url);
  }

  if (isTextFile(url) || LINEAR_UPLOAD_RE.test(url)) {
    return fetchRawText(url, LINEAR_UPLOAD_RE.test(url));
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

  const buffer = Buffer.from(res.data);
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

// ── Fallback ──────────────────────────────────────────────────────────────

async function fetchRawText(url: string, withLinearAuth = false): Promise<string> {
  const headers: Record<string, string> = {};

  if (withLinearAuth && process.env.LINEAR_API_KEY) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, { timeout: 30_000, headers });
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