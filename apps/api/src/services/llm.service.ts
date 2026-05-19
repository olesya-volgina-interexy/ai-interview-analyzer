
import type { InterviewMeta, CandidateAnalysis } from '@shared/schemas';
import { CandidateAnalysisSchema } from '@shared/schemas';
import { FinalResultAnalysisSchema } from '@shared/schemas';
import type { FinalResultAnalysis } from '@shared/schemas';
import { llmClient, LLM_MODEL } from './llm.client';
import {
  buildSystemPrompt,
  buildUserMessage,
  buildTechnicalStep1Prompt,
  buildTechnicalStep2Prompt,
  buildStep1UserMessage,
  MANAGER_CALL_JSON_SCHEMA,
  buildFinalResultSystemPrompt,
  FINAL_RESULT_JSON_SCHEMA
} from '../prompts/analyze.prompt';
import {
  processExtraction,
  buildStep2Input,
  type Step1Output,
  type ProcessedExtraction,
} from './extraction.middleware';
import { describeError } from '../utils/errorLogger';
import { truncateTranscript, type TruncationResult } from '../utils/transcriptUtils';

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// Inline system-prompt note appended when the transcript had to be truncated.
// The LLM is required to surface this in the final overallAssessment so the
// recruiter knows part of the conversation was not analysed.
function buildTruncationSystemNote(t: TruncationResult): string {
  return `

TRANSCRIPT TRUNCATION NOTICE:
The transcript was too long to fit token limits. ~${t.droppedPercent}% of the middle section was omitted (kept the beginning and the end). Original length: ${t.originalChars.toLocaleString()} chars; analysed: ${t.finalChars.toLocaleString()} chars.

You MUST mention this limitation explicitly at the start of overallAssessment, e.g.:
"Note: ~${t.droppedPercent}% of the transcript (middle section) was not analysed due to length limits — assessment is based on the opening and closing portions only."
Then continue with the normal assessment.`;
}

export async function analyzeInterview(
  transcript: string,
  meta: InterviewMeta,
  options?: {
    cvText?: string;
    brokerRequest?: string;
    similarCases?: string;
  }
): Promise<CandidateAnalysis> {

  if (meta.stage === 'technical') {
    return analyzeTechnicalInterview(transcript, meta, options);
  }

  // Manager call — single step
  const truncation = truncateTranscript(transcript);
  if (truncation.wasTruncated) {
    console.log('[stage:llm] manager_call transcript truncated', {
      originalChars: truncation.originalChars,
      droppedChars: truncation.droppedChars,
      droppedPercent: truncation.droppedPercent,
    });
  }

  const systemPrompt = buildSystemPrompt(meta)
    + '\n\n' + MANAGER_CALL_JSON_SCHEMA
    + (truncation.wasTruncated ? buildTruncationSystemNote(truncation) : '');
  const userMessage = buildUserMessage(
    truncation.text,
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
    max_completion_tokens: 6000,
  });

  const choice = response.choices[0];
  const rawContent = stripJsonFences(choice.message.content ?? '{}');

  if (choice.finish_reason === 'length') {
    console.error('LLM response truncated (finish_reason=length):', rawContent);
    throw new Error('LLM response truncated — increase max_completion_tokens or shorten the schema');
  }

  try {
    const parsed = JSON.parse(rawContent);
    return CandidateAnalysisSchema.parse(parsed);
  } catch (err) {
    console.error('[stage:llm] analyzeInterview parse/schema failed', {
      ...describeError(err),
      stage: meta.stage,
      role: meta.role,
      level: meta.level,
      rawContentPreview: rawContent.slice(0, 1500),
    });
    throw new Error('Failed to parse LLM response');
  }
}

async function analyzeTechnicalInterview(
  transcript: string,
  meta: InterviewMeta,
  options?: {
    cvText?: string;
    brokerRequest?: string;
    similarCases?: string;
  }
): Promise<CandidateAnalysis> {

  // ── Step 1: extraction + domain judgment (LLM does the heavy lifting) ─────
  console.log('[stage:llm] technical step 1 — extraction start');

  const truncation = truncateTranscript(transcript);
  if (truncation.wasTruncated) {
    console.log('[stage:llm] technical transcript truncated', {
      originalChars: truncation.originalChars,
      droppedChars: truncation.droppedChars,
      droppedPercent: truncation.droppedPercent,
    });
  }

  const step1Response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: buildTechnicalStep1Prompt(options?.brokerRequest) },
      { role: 'user', content: buildStep1UserMessage(truncation.text, options?.brokerRequest) },
    ],
    max_completion_tokens: 8000,
  });

  const step1Choice = step1Response.choices[0];

  if (step1Choice.finish_reason === 'length') {
    console.error('[stage:llm] step 1 truncated');
    throw new Error('Technical step 1 truncated — transcript may be too long');
  }

  const extractionRaw = stripJsonFences(step1Choice.message.content ?? '{}');

  let step1Parsed: Step1Output;
  try {
    step1Parsed = JSON.parse(extractionRaw) as Step1Output;
  } catch {
    console.error('[stage:llm] step 1 returned invalid JSON', { preview: extractionRaw.slice(0, 500) });
    throw new Error('Technical step 1 returned invalid JSON');
  }

  console.log('[stage:llm] technical step 1 output:', extractionRaw);
  console.log('[stage:llm] technical step 1 done, starting middleware + step 2');

  const processed = processExtraction(step1Parsed, options?.cvText, options?.brokerRequest, meta);
  if (truncation.wasTruncated) {
    processed.truncation = truncation;
  }

  // ── Step 2: LLM writes human-readable assessment ────────────────────────
  const step2UserContent = buildStep2Input(processed, options?.brokerRequest);
  const step2SystemPrompt = buildTechnicalStep2Prompt(meta)
    + (truncation.wasTruncated ? buildTruncationSystemNote(truncation) : '');

  const step2Response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: step2SystemPrompt },
      { role: 'user', content: step2UserContent },
    ],
    max_completion_tokens: 3000,
  });

  const step2Choice = step2Response.choices[0];
  const rawContent = stripJsonFences(step2Choice.message.content ?? '{}');

  if (step2Choice.finish_reason === 'length') {
    console.error('LLM response truncated (finish_reason=length):', rawContent);
    throw new Error('LLM response truncated — increase max_completion_tokens');
  }

  try {
    const assessment = JSON.parse(rawContent);
    return mergeTechnicalOutput(processed, assessment);
  } catch (err) {
    console.error('[stage:llm] analyzeInterview parse/schema failed', {
      ...describeError(err),
      stage: meta.stage,
      role: meta.role,
      level: meta.level,
      rawContentPreview: rawContent.slice(0, 1500),
    });
    throw new Error('Failed to parse LLM response');
  }
}

function mergeTechnicalOutput(processed: ProcessedExtraction, assessment: Record<string, unknown>): CandidateAnalysis {
  return CandidateAnalysisSchema.parse({
    stage: 'technical',
    interviewFormat: processed.interviewFormat,
    targetRole: assessment.targetRole ?? '',
    nonTargetRoles: assessment.nonTargetRoles ?? [],
    overallAssessment: assessment.overallAssessment ?? '',
    technicalLevel: assessment.technicalLevel ?? processed.technicalLevel,
    languageAssessment: processed.languageAssessment,
    strengths: processed.strengths,
    weaknesses: processed.weaknesses,
    risks: processed.risks,
    interviewerSentiment: processed.interviewerSentiment,
    technicalSkills: assessment.technicalSkills ?? {
      depthOfKnowledge: '', problemSolving: '', codeQuality: '', systemDesign: '',
    },
    cvMatch: {
      declaredSkills: processed.declaredSkills,
      confirmedSkills: processed.confirmedSkills,
      unconfirmedSkills: processed.unconfirmedSkills,
      discrepancies: processed.discrepancies,
      cvMatchScore: processed.cvMatchScore,
    },
    brokerRequestMatch: {
      requiredSkills: processed.requiredSkills,
      coveredRequirements: processed.coveredRequirements,
      missingRequirements: processed.missingRequirements,
      notAssessedRequirements: processed.notAssessedRequirements,
      brokerMatchScore: processed.brokerMatchScore,
      brokerFitSummary: assessment.brokerFitSummary ?? '',
      brokerProxyScore: processed.brokerProxyScore,
      brokerCoveragePercent: processed.brokerCoveragePercent,
      brokerCoverageReliability: processed.brokerCoverageReliability,
    },
    // Enforce: no_hire is only valid when there are missing requirements
    recommendation: (assessment.recommendation === 'no_hire' && processed.missingRequirements.length === 0)
      ? 'uncertain'
      : assessment.recommendation ?? 'uncertain',
    reasoning: assessment.reasoning ?? '',
    // Enforce: decisionBreakers only for no_hire, and only from missingRequirements
    decisionBreakers: assessment.recommendation === 'no_hire' && processed.missingRequirements.length > 0
      ? (assessment.decisionBreakers ?? [])
      : [],
    roleFitSummary: assessment.roleFitSummary ?? '',
    score: processed.score,
    answerQualityScore: processed.answerQualityScore,
    scopeCoverageScore: processed.scopeCoverageScore,
    questions: processed.questions,
  });
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
    max_completion_tokens: 2000,
  });

  const raw = stripJsonFences(response.choices[0].message.content ?? '{}');

  try {
    return FinalResultAnalysisSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error('[stage:llm] analyzeFinalResult parse/schema failed', {
      ...describeError(err),
      decision,
      rawContentPreview: raw.slice(0, 1500),
    });
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
      max_completion_tokens: 1000,
    });

    const raw = stripJsonFences(response.choices[0].message.content ?? '[]');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.clusters ?? parsed.groups ?? parsed.items ?? []);
    return arr
      .filter((i: any) => i.text && typeof i.count === 'number')
      .slice(0, 8);
  } catch (err) {
    console.error('[stage:llm] clusterTextItems failed', { ...describeError(err), type, itemsCount: items.length });
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