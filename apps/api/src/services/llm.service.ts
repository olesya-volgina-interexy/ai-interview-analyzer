
import type { InterviewMeta, CandidateAnalysis } from '@shared/schemas';
import { CandidateAnalysisSchema } from '@shared/schemas';
import { llmClient, LLM_MODEL } from './llm.client';
import {
  buildSystemPrompt,
  buildUserMessage,
  MANAGER_CALL_JSON_SCHEMA,
  TECHNICAL_JSON_SCHEMA,
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
    max_tokens: 3000,
  });

  const rawContent = response.choices[0].message.content ?? '{}';

  try {
    const parsed = JSON.parse(rawContent);
    return CandidateAnalysisSchema.parse(parsed);
  } catch (err) {
    console.error('LLM returned invalid JSON:', rawContent);
    throw new Error('Failed to parse LLM response');
  }
}