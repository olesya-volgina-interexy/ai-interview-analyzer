// apps/api/src/services/bluedot.service.ts

import axios from 'axios';
import pdfParse from 'pdf-parse';
import puppeteer from 'puppeteer';

const BLUEDOT_PREVIEW_RE = /bluedothq\.com\/preview\//i;
const LINEAR_UPLOAD_RE = /uploads\.linear\.app\//i;

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

// ── Bluedot preview — Puppeteer ───────────────────────────────────────────

async function fetchBluedotPreview(url: string): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    // Bluedot — SPA с долгоживущими соединениями; networkidle2 никогда не
    // наступает. Ждём только готовности DOM, а наличие контента проверяем
    // отдельным waitForFunction ниже.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    try {
      // Ждём пока BlueDot отрисует сами реплики: либо появится маркер
      // "Speaker:" (стандартный формат BlueDot), либо накопится достаточно
      // текста. Явный polling=500ms вместо дефолтного raf, который в
      // headless режиме на idle SPA тикает редко.
      await page.waitForFunction(
        () => {
          const t = document.body.innerText;
          return t.includes('Speaker:') || t.length > 3000;
        },
        { timeout: 90_000, polling: 500 }
      );
    } catch (waitErr) {
      // Таймаут ожидания контента — снимаем диагностику, чтобы в логе
      // было видно, что реально отдал BlueDot (login? 404? пустой shell?).
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

    // Извлекаем полный текст страницы, а потом вырезаем секцию транскрипции
    const raw = await page.evaluate(() => document.body.innerText);
    const extracted = extractTranscriptSection(raw);

    if (!extracted || extracted.length < 50) {
      throw new Error('Transcript section is empty or too short');
    }

    return extracted;
  } finally {
    await browser.close();
  }
}

// ── Вырезать секцию транскрипции из полного текста страницы ──────────────

function extractTranscriptSection(raw: string): string {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // Ищем строку с "Transcript" как заголовок таба
  const transcriptTabIdx = lines.findIndex(l =>
    /^transcript$/i.test(l)
  );

  // Всё после заголовка "Transcript" — это и есть контент
  const contentLines = transcriptTabIdx !== -1
    ? lines.slice(transcriptTabIdx + 1)
    : lines;

  // Убираем мусор: строки навигации, кнопки, поиск
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

  const parsed = await pdfParse(Buffer.from(res.data));
  const text = parsed.text.trim();

  if (!text) throw new Error(`PDF transcript is empty: ${url}`);
  return text;
}

// ── Fallback ──────────────────────────────────────────────────────────────

async function fetchRawText(url: string, withLinearAuth = false): Promise<string> {
  const headers: Record<string, string> = {};

  if (withLinearAuth && process.env.LINEAR_API_KEY) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, { timeout: 30_000, headers });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

// ── Утилиты ───────────────────────────────────────────────────────────────


function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url) || url.includes('application/pdf');
}

function isTextFile(url: string): boolean {
  return /\.(txt|docx?)(\?.*)?$/i.test(url);
}