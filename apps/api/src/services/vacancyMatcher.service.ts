import { createHash } from 'node:crypto';
import { z } from 'zod';
import { llmClient, LLM_MODEL_EXTRACTION } from './llm.client';
import { redis } from './../db/redis';
import { describeError } from '../utils/errorLogger';

// Сопоставление кандидата с одной из вакансий в multi-vacancy тикете.
// Если в тикете несколько вакансий, мы не должны проверять кандидата по
// требованиям сразу всех — score падает, recommendation флипается. Этот
// сервис принимает решение, какая вакансия "его".

export interface VacancyForMatching {
  title: string;
  content: string;
}

const MatchResultSchema = z.object({
  vacancyIndex: z.number().int().min(0),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
});

export type VacancyMatchResult = z.infer<typeof MatchResultSchema>;

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

function cacheKey(
  vacancies: VacancyForMatching[],
  cvText: string,
  transcript: string,
): string {
  const payload = JSON.stringify({
    v: vacancies.map((v) => v.title + '|' + v.content.slice(0, 500)),
    cv: cvText.slice(0, 4000),
    t: transcript.slice(0, 2000),
  });
  return `vacancy-match:${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`;
}

const SYSTEM_PROMPT = `You are deciding which job vacancy a candidate is being interviewed for.

You receive:
- N possible vacancies from a single recruitment ticket (each with a title and full description/requirements)
- The candidate's CV
- The interview transcript (what was actually discussed)

Pick the SINGLE vacancy that best matches BOTH the candidate's CV background AND the topics covered in the interview.

CONFIDENCE LEVELS:
- "high"   — CV and transcript both clearly point to the same vacancy (e.g. CV is SAP FI specialist, interview discussed SAP FI customizing, GL, AP).
- "medium" — CV strongly fits one vacancy, transcript is mixed or partially off-topic. Still confident enough to pick.
- "low"    — CV is multi-profile OR transcript does not give a clear signal OR vacancies are very similar. Pick the best guess but flag as low.

Return STRICT JSON, no markdown:
{
  "vacancyIndex": 0,
  "confidence": "high" | "medium" | "low",
  "reasoning": "1-2 sentences. Cite concrete evidence from CV and transcript."
}

vacancyIndex MUST be a valid 0-based index into the vacancies array.`;

function buildUserMessage(params: {
  vacancies: VacancyForMatching[];
  cvText: string;
  transcript: string;
}): string {
  const vacancyBlocks = params.vacancies
    .map(
      (v, i) =>
        `<vacancy index="${i}">\n<title>${v.title}</title>\n<requirements>\n${v.content}\n</requirements>\n</vacancy>`,
    )
    .join('\n\n');

  return `${vacancyBlocks}

<candidate_cv>
${params.cvText.trim() || 'CV not provided'}
</candidate_cv>

<interview_transcript>
${params.transcript.trim() || 'Transcript not provided'}
</interview_transcript>

Decide which vacancy this candidate was being interviewed for.`;
}

export async function matchVacancyToCandidate(params: {
  vacancies: VacancyForMatching[];
  cvText: string;
  transcript: string;
}): Promise<VacancyMatchResult | null> {
  if (params.vacancies.length < 2) return null;

  const trimmedCv = params.cvText.trim();
  const trimmedTranscript = params.transcript.trim();
  if (!trimmedCv && !trimmedTranscript) {
    // Без хотя бы одного сигнала угадывать бессмысленно.
    return null;
  }

  const key = cacheKey(params.vacancies, trimmedCv, trimmedTranscript);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = MatchResultSchema.safeParse(JSON.parse(cached));
      if (parsed.success && parsed.data.vacancyIndex < params.vacancies.length) {
        return parsed.data;
      }
    }
  } catch (err) {
    console.warn('[vacancy-match] Redis cache read failed', describeError(err));
  }

  let raw: string;
  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL_EXTRACTION,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserMessage({
            vacancies: params.vacancies,
            cvText: trimmedCv,
            transcript: trimmedTranscript,
          }),
        },
      ],
      temperature: 0,
      seed: 42,
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
    });
    raw = response.choices[0].message.content?.trim() ?? '';
  } catch (err) {
    console.warn('[vacancy-match] LLM call failed', describeError(err));
    return null;
  }

  if (!raw) return null;

  let result: VacancyMatchResult;
  try {
    result = MatchResultSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.warn('[vacancy-match] response parse/schema failed', {
      ...describeError(err),
      preview: raw.slice(0, 500),
    });
    return null;
  }

  if (result.vacancyIndex >= params.vacancies.length) {
    console.warn('[vacancy-match] LLM returned out-of-range vacancyIndex', {
      index: result.vacancyIndex,
      n: params.vacancies.length,
    });
    return null;
  }

  try {
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn('[vacancy-match] Redis cache write failed', describeError(err));
  }

  return result;
}
