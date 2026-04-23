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

    // Ждём пока появится реальный текст транскрипции (реплики рендерятся
    // после первой сетевой подгрузки).
    await page.waitForFunction(
      () => document.body.innerText.length > 100,
      { timeout: 30_000 }
    );

    // Извлекаем текст: ищем блоки с именами спикеров + текстом реплик
    const transcript = await page.evaluate(() => {
      // Стратегия 1: ищем элементы с паттерном "Speaker: X" + следующий текст
      const lines: string[] = [];

      // Bluedot обычно рендерит так:
      //   <div/span> "Speaker: A" 
      //   <p/div> текст реплики
      // Берём весь innerText страницы и режем по паттерну Speaker:
      const raw = document.body.innerText;
      return raw;
    });

    // Из полного innerText вырезаем только секцию транскрипции
    const extracted = extractTranscriptSection(transcript);

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