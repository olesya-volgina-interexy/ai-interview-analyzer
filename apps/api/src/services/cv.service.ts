// apps/api/src/services/cv.service.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import axios from 'axios';
import pdfParse from 'pdf-parse';
import { llmClient, LLM_MODEL } from './llm.client';

// Скачать и распарсить CV по ссылке
export async function extractCVText(cvUrl: string): Promise<string> {
  try {
    const response = await axios.get(cvUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const contentType = String(response.headers['content-type'] ?? '');
    const raw = Buffer.from(response.data).toString('utf-8');

    if (contentType.includes('pdf')) {
      const parsed = await pdfParse(Buffer.from(response.data));
      return parsed.text.slice(0, 5000);
    }

    // HTML — убираем теги и скрипты
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

    return text.slice(0, 5000);
  } catch (err: any) {
    // Чистый вывод ошибки без огромного стектрейса
    const status = err.response?.status;
    const code = err.code;
    
    if (status === 404) {
      console.warn(`CV not found (404): ${cvUrl}`);
    } else if (status === 403) {
      console.warn(`CV access forbidden (403): ${cvUrl}`);
    } else if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
      console.warn(`CV fetch timeout/connection error: ${cvUrl}`);
    } else {
      console.warn(`CV fetch failed: ${cvUrl} — ${err.message || err}`);
    }
    
    return '';
  }
}

// Извлечь имя кандидата из текста CV через LLM
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
${cvText.slice(0, 2000)}`,
      }],
      max_tokens: 20,
      temperature: 0,
    });

    const name = response.choices[0].message.content?.trim();
    if (!name || name === 'null') return null;
    return name;
  } catch {
    return null;
  }
}

// Определить уровень кандидата из текста CV через LLM
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
${cvText.slice(0, 3000)}`,
      }],
      max_tokens: 10,
      temperature: 0,
    });

    const level = response.choices[0].message.content?.trim();
    if (level === 'Junior' || level === 'Middle' || level === 'Senior') return level;
    return 'Middle';
  } catch {
    return 'Middle';
  }
}