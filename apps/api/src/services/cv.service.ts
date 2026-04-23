// apps/api/src/services/cv.service.ts

import axios from 'axios';
import pdfParse from 'pdf-parse';
import { llmClient, LLM_MODEL } from './llm.client';
import { describeError } from '../utils/errorLogger';

// Константы для определения типа ссылки
const LINEAR_UPLOAD_RE = /uploads\.linear\.app\//i;

// ── Главная функция извлечения текста ──────────────────────────────────

export async function extractCVText(cvUrl: string): Promise<string> {
  const url = cvUrl.trim();
  if (!url) return '';

  try {
    // 1. Если это PDF (по расширению)
    if (isPdfUrl(url)) {
      return await fetchPdfContent(url);
    }

    // 2. Если это текстовый файл или вложение Linear
    if (isTextFile(url) || LINEAR_UPLOAD_RE.test(url)) {
      return await fetchRawTextContent(url, LINEAR_UPLOAD_RE.test(url));
    }

    // 3. Для всех остальных ссылок (включая VisualCV и обычные веб-страницы)
    return await fetchGenericWebContent(url);
  } catch (err: any) {
    logError(url, err);
    return '';
  }
}

// ── Приватные методы загрузки и парсинга ────────────────────────────────

async function fetchPdfContent(url: string): Promise<string> {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const parsed = await pdfParse(Buffer.from(res.data));
  const text = parsed.text.trim();

  if (!text) throw new Error(`PDF content is empty`);
  return text.slice(0, 7000);
}

async function fetchRawTextContent(url: string, withLinearAuth = false): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };

  if (withLinearAuth && process.env.LINEAR_API_KEY) {
    headers['Authorization'] = process.env.LINEAR_API_KEY;
  }

  const res = await axios.get(url, { timeout: 20_000, headers });
  
  // Если пришли данные не в строке (например, JSON), приводим к строке
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return text.slice(0, 7000);
}

async function fetchGenericWebContent(url: string): Promise<string> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const contentType = String(response.headers['content-type'] ?? '');
  const buffer = Buffer.from(response.data);

  // Если по ссылке без расширения .pdf всё равно пришел PDF
  if (contentType.includes('application/pdf')) {
    const parsed = await pdfParse(buffer);
    return parsed.text.slice(0, 7000);
  }

  // Обработка как HTML (ваша текущая рабочая логика для VisualCV)
  const raw = buffer.toString('utf-8');
  const text = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // удаляем скрипты
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // удаляем стили
    .replace(/<[^>]+>/g, ' ')                         // удаляем теги
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')                             // схлопываем пробелы
    .trim();

  return text.slice(0, 7000);
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

function isTextFile(url: string): boolean {
  return /\.(txt|rtf)(\?.*)?$/i.test(url);
}

function logError(url: string, err: any) {
  console.warn('[stage:cv] fetch failed', { url, ...describeError(err) });
}

// ── Функции извлечения данных через LLM ───────────────────────────────────

export async function extractNameFromCV(cvText: string): Promise<string | null> {
  if (!cvText) return null;

  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{
        role: 'user',
        content: `Extract the candidate's full name from this CV.
Return ONLY the full name (e.g. "John Smith"). If the name cannot be determined, return "null".

CV:
${cvText.slice(0, 2500)}`,
      }],
      max_tokens: 20,
      temperature: 0,
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
      max_tokens: 10,
      temperature: 0,
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
      max_tokens: 20,
      temperature: 0,
    });

    const name = response.choices[0].message.content?.trim();
    if (!name || name === 'null') return null;
    return name;
  } catch (err) {
    console.warn('[stage:cv] extractNameFromTranscript failed', describeError(err));
    return null;
  }
}