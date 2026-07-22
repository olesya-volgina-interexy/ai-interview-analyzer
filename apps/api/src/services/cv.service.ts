// apps/api/src/services/cv.service.ts

import pdfParse from 'pdf-parse';
import { llmClient, LLM_MODEL } from './llm.client';
import { describeError } from '../utils/errorLogger';
import { sanitizePdfText, assertExtractedTextPlausible } from '../utils/pdfUtils';
import { stripNullBytes } from '../utils/textSanitize';
import { assertPublicHttpUrl, isExactHost, safeAxios as axios } from '../utils/ssrf';

const LINEAR_UPLOAD_HOST = 'uploads.linear.app';

// ── Главная функция извлечения текста ──────────────────────────────────

const CV_MAX_CHARS = 20_000;

export async function extractCVText(cvUrl: string): Promise<string> {
  const url = cvUrl.trim();
  if (!url) return '';

  await assertPublicHttpUrl(url);

  if (isPdfUrl(url)) {
    return await fetchPdfContent(url, CV_MAX_CHARS);
  }

  // Linear-загрузки приходят без расширения (uploads.linear.app/<uuid>/...),
  // поэтому тип определяем по содержимому, а не по URL.
  if (isExactHost(url, LINEAR_UPLOAD_HOST)) {
    return await fetchLinearUploadContent(url, CV_MAX_CHARS);
  }

  if (isTextFile(url)) {
    return await fetchRawTextContent(url, CV_MAX_CHARS, false);
  }

  return await fetchGenericWebContent(url, CV_MAX_CHARS);
}

// ── Приватные методы загрузки и парсинга ────────────────────────────────

async function fetchPdfContent(url: string, maxChars: number): Promise<string> {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const buffer = Buffer.from(res.data);
  const parsed = await pdfParse(buffer);
  const text = sanitizePdfText(parsed.text);

  if (!text) throw new Error(`PDF content is empty`);
  assertExtractedTextPlausible(text, buffer.length, url);
  return text.slice(0, maxChars);
}

// Linear-вложение: тянем байты с Linear-авторизацией и определяем тип по
// сигнатуре. PDF (%PDF) парсим через pdf-parse, остальное читаем как текст.
async function fetchLinearUploadContent(url: string, maxChars: number): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
  if (process.env.LINEAR_API_KEY && isExactHost(url, LINEAR_UPLOAD_HOST)) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers,
  });

  const buffer = Buffer.from(res.data);
  const contentType = String(res.headers['content-type'] ?? '');
  const isPdf =
    buffer.subarray(0, 5).toString('latin1').startsWith('%PDF') ||
    contentType.includes('application/pdf');

  if (isPdf) {
    const parsed = await pdfParse(buffer);
    const text = sanitizePdfText(parsed.text);
    if (!text) throw new Error('PDF content is empty');
    assertExtractedTextPlausible(text, buffer.length, url);
    return text.slice(0, maxChars);
  }

  return stripNullBytes(buffer.toString('utf-8')).slice(0, maxChars);
}

async function fetchRawTextContent(url: string, maxChars: number, withLinearAuth = false): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };

  if (withLinearAuth && process.env.LINEAR_API_KEY && isExactHost(url, LINEAR_UPLOAD_HOST)) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, { timeout: 20_000, headers });

  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return stripNullBytes(raw).slice(0, maxChars);
}

async function fetchGenericWebContent(url: string, maxChars: number): Promise<string> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const contentType = String(response.headers['content-type'] ?? '');
  const buffer = Buffer.from(response.data);

  if (contentType.includes('application/pdf')) {
    const parsed = await pdfParse(buffer);
    const text = sanitizePdfText(parsed.text);
    assertExtractedTextPlausible(text, buffer.length, url);
    return text.slice(0, maxChars);
  }

  const raw = stripNullBytes(buffer.toString('utf-8'));
  const text = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, maxChars);
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

function isTextFile(url: string): boolean {
  return /\.(txt|rtf)(\?.*)?$/i.test(url);
}

// ── Функции извлечения данных через LLM ───────────────────────────────────

export async function extractNameFromCV(cvText: string): Promise<string | null> {
  if (!cvText) return null;

  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{
        role: 'user',
        content: `Extract the candidate's name from this CV.
Return ONLY the name exactly as written — even if it's just a first name with an initial (e.g. "Michael K") or a first name only.
Return "null" only if no personal name appears anywhere in the text.

CV:
${cvText.slice(0, 2500)}`,
      }],
      max_completion_tokens: 500,
    });

    const name = response.choices[0].message.content?.trim();
    if (!name || name === 'null') return null;
    return name;
  } catch (err) {
    console.warn('[stage:cv] extractNameFromCV failed', describeError(err));
    return null;
  }
}

export async function detectLevelFromCV(
  cvText: string
): Promise<'Junior' | 'Middle' | 'Senior'> {
  if (!cvText) return 'Middle';

  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{
        role: 'user',
        content: `Based on this CV, determine the candidate experience level.
Return ONLY one word: Junior, Middle, or Senior. Nothing else.

CV:
${cvText.slice(0, 3500)}`,
      }],
      max_completion_tokens: 500,
    });

    const level = response.choices[0].message.content?.trim();
    if (level === 'Junior' || level === 'Middle' || level === 'Senior') return level;
    return 'Middle';
  } catch (err) {
    console.warn('[stage:cv] detectLevelFromCV failed', describeError(err));
    return 'Middle';
  }
}

export async function extractNameFromTranscript(transcript: string): Promise<string | null> {
  if (!transcript) return null;

  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{
        role: 'user',
        content: `Extract the candidate's full name from this interview transcript.
The candidate is the interviewee, not the interviewer.
Return ONLY the full name (e.g. "John Smith", "John S"). If the name cannot be determined, return "null".

Transcript (first 2000 chars):
${transcript.slice(0, 2000)}`,
      }],
      max_completion_tokens: 500,
    });

    const name = response.choices[0].message.content?.trim();
    if (!name || name === 'null') return null;
    return name;
  } catch (err) {
    console.warn('[stage:cv] extractNameFromTranscript failed', describeError(err));
    return null;
  }
}