
import type { InterviewMeta, CandidateAnalysis } from '@shared/schemas';
import { CandidateAnalysisSchema } from '@shared/schemas';
import { FinalResultAnalysisSchema } from '@shared/schemas';
import type { FinalResultAnalysis } from '@shared/schemas';
import { llmClient, LLM_MODEL } from './llm.client';
import {
  buildSystemPrompt,
  buildUserMessage,
  MANAGER_CALL_JSON_SCHEMA,
  TECHNICAL_JSON_SCHEMA,
  buildFinalResultSystemPrompt,
  FINAL_RESULT_JSON_SCHEMA
} from '../prompts/analyze.prompt';

export async function analyzeInterview(
  transcript: string,
  meta: InterviewMeta,
  options?: {
    cvText?: string;
    brokerRequest?: string;
    similarCases?: string;
  }
): Promise<CandidateAnalysis> {

  const jsonSchema = meta.stage === 'manager_call'
    ? MANAGER_CALL_JSON_SCHEMA
    : TECHNICAL_JSON_SCHEMA;

  const systemPrompt = buildSystemPrompt(meta) + '\n\n' + jsonSchema;
  const userMessage = buildUserMessage(
    transcript,
    options?.cvText,
    options?.brokerRequest,
    options?.similarCases
  );

  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 6000,
  });

  const choice = response.choices[0];
  const rawContent = choice.message.content ?? '{}';

  if (choice.finish_reason === 'length') {
    console.error('LLM response truncated (finish_reason=length):', rawContent);
    throw new Error('LLM response truncated — increase max_tokens or shorten the schema');
  }

  try {
    const parsed = JSON.parse(rawContent);
    return CandidateAnalysisSchema.parse(parsed);
  } catch (err) {
    console.error('LLM returned invalid JSON:', rawContent);
    throw new Error('Failed to parse LLM response');
  }
}

export async function analyzeFinalResult(
  previousAnalyses: string,
  decision: 'hired' | 'lost'
): Promise<FinalResultAnalysis> {
  const systemPrompt = buildFinalResultSystemPrompt(decision)
    + '\n\n' + FINAL_RESULT_JSON_SCHEMA;

  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `PREVIOUS ANALYSES:\n\n${previousAnalyses}`
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw = response.choices[0].message.content ?? '{}';

  try {
    return FinalResultAnalysisSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error('Failed to parse final result:', raw);
    throw new Error('Failed to parse final result analysis');
  }
}

export async function clusterTextItems(
  items: string[],
  type: 'decision_breakers' | 'weaknesses' | 'strengths'
): Promise<Array<{ text: string; count: number }>> {
  if (items.length === 0) return [];

  const label = type === 'decision_breakers' ? 'rejection reasons'
    : type === 'strengths' ? 'candidate strengths'
    : 'candidate weaknesses';

  const prompt = `You are analyzing recruitment interview data.
Below is a list of ${label} extracted from multiple interviews. Many items say the same thing in different words.

Your task:
1. Group semantically similar items together
2. For each group, write ONE concise label (max 8 words, English, sentence case)
3. Count how many original items fall into each group
4. Return top 8 groups by count, sorted descending

Return ONLY valid JSON object, no markdown:
{ "clusters": [{ "text": "concise group label", "count": number }, ...] }

Items to cluster:
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`;

  try {
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = response.choices[0].message.content ?? '[]';
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.clusters ?? parsed.groups ?? parsed.items ?? []);
    return arr
      .filter((i: any) => i.text && typeof i.count === 'number')
      .slice(0, 8);
  } catch (err) {
    console.error('Failed to cluster items:', err);
    // Fallback — возвращаем простой подсчёт без кластеризации
    const map: Record<string, number> = {};
    for (const item of items) {
      const key = item.toLowerCase().slice(0, 60);
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([text, count]) => ({ text, count }));
  }
}