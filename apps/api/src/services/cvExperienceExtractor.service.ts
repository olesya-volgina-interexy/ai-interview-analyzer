import { createHash } from 'node:crypto';
import { z } from 'zod';
import { llmClient, LLM_MODEL } from './llm.client';
import {
  CV_EXPERIENCE_SYSTEM_PROMPT,
  buildCvExperienceUserMessage,
} from '../prompts/cvExperience.prompt';
import { redis } from '../db/redis';
import { describeError } from '../utils/errorLogger';

const ExperienceProjectSchema = z.object({
  name: z.string().min(1),
  period: z.string().min(1),
});

const ExperienceRowSchema = z.object({
  technology: z.string().min(1),
  totalDuration: z.string(),
  projects: z.array(ExperienceProjectSchema),
});

const ExperienceTableSchema = z.object({
  rows: z.array(ExperienceRowSchema),
});

export type ExperienceProject = z.infer<typeof ExperienceProjectSchema>;
export type ExperienceRow = z.infer<typeof ExperienceRowSchema>;
export type ExperienceTable = z.infer<typeof ExperienceTableSchema>;

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней — CV редко меняются

function cacheKey(cvText: string): string {
  const digest = createHash('sha256').update(cvText).digest('hex').slice(0, 32);
  return `cv-exp:${digest}`;
}

export async function extractExperienceTable(
  cvText: string,
): Promise<ExperienceTable> {
  const trimmed = cvText.trim();
  if (trimmed.length < 50) {
    // Слишком короткий текст — нечего извлекать, экономим LLM-вызов.
    return { rows: [] };
  }

  const key = cacheKey(trimmed);
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = ExperienceTableSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return parsed.data;
      // Кеш испорчен — игнорируем и пересчитываем.
    }
  } catch (err) {
    console.warn('[cv-experience] Redis cache read failed', describeError(err));
  }

  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: CV_EXPERIENCE_SYSTEM_PROMPT },
      { role: 'user', content: buildCvExperienceUserMessage(trimmed) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const choice = response.choices[0];
  const raw = choice.message.content ?? '{}';

  if (choice.finish_reason === 'length') {
    console.error('[cv-experience] LLM response truncated (max_tokens hit)');
  }

  let table: ExperienceTable;
  try {
    table = ExperienceTableSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error('[cv-experience] parse/schema failed', {
      ...describeError(err),
      rawPreview: raw.slice(0, 1500),
    });
    // Не валим всю генерацию доки — отдадим пустую таблицу,
    // markdown просто покажет пустую секцию.
    return { rows: [] };
  }

  try {
    await redis.set(key, JSON.stringify(table), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn('[cv-experience] Redis cache write failed', describeError(err));
  }

  return table;
}

// Рендер таблицы опыта в markdown-формат.
// Возвращает либо markdown-таблицу, либо строку-заглушку, если строк нет.
export function renderExperienceTableMarkdown(table: ExperienceTable): string {
  if (table.rows.length === 0) {
    return '_Could not extract structured experience from the CV — see the link above._';
  }

  const header = '| Technology | Experience | Projects & periods |\n|---|---|---|';
  const rows = table.rows.map((row) => {
    const projects =
      row.projects.length === 0
        ? '—'
        : row.projects
            .map((p) => `${escapePipes(p.name)} — ${escapePipes(p.period)}`)
            .join('<br>');
    return `| ${escapePipes(row.technology)} | ${escapePipes(row.totalDuration)} | ${projects} |`;
  });
  return [header, ...rows].join('\n');
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
