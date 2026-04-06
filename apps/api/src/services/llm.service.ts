
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