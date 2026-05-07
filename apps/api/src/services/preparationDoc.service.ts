import { llmClient, LLM_MODEL } from './llm.client';
import { extractCVText } from './cv.service';
import { buildClientProfile } from './clientProfile.service';
import { findSimilarInterviews } from './rag.service';
import { embedText } from './embedding.service';
import { getInterviewsByIds } from '../db/db.service';
import { prisma } from '../db/prisma';
import {
  buildPreparationDocSystemPrompt,
  buildPreparationDocUserMessage,
} from '../prompts/preparation.prompt';
import { runStage } from '../utils/errorLogger';

export type PreparationDocProgress = 'context' | 'rag' | 'llm';

export interface GeneratePreparationDocResult {
  markdown: string;
  sourceInterviewIds: string[];
}

export async function generatePreparationDoc(params: {
  candidateName: string;
  clientName: string;
  cvText?: string;
  cvUrl?: string;
  brokerRequest?: string;
  onProgress?: (stage: PreparationDocProgress) => void | Promise<void>;
}): Promise<GeneratePreparationDocResult> {
  const { candidateName, clientName } = params;

  // 1. CV text + role/level from PipelineCandidate
  let cvText = params.cvText?.trim() || undefined;
  let resolvedCvUrl = params.cvUrl;
  let role: string | undefined;
  let level: string | undefined;

  const candidate = await runStage(
    'db',
    () =>
      prisma.pipelineCandidate.findFirst({
        where: { candidateName, clientName },
        orderBy: { cvSubmittedAt: 'desc' },
        select: { cvUrl: true, cvText: true, role: true, level: true },
      }),
    { op: 'pipelineCandidate.findFirst', candidateName, clientName },
  );

  if (candidate) {
    role = candidate.role ?? undefined;
    level = candidate.level ?? undefined;
    if (!cvText && candidate.cvText) cvText = candidate.cvText;
    if (!cvText && !resolvedCvUrl && candidate.cvUrl) resolvedCvUrl = candidate.cvUrl;
  }

  if (!cvText && resolvedCvUrl) {
    cvText = await runStage(
      'cv',
      () => extractCVText(resolvedCvUrl!),
      { op: 'extractCVText', cvUrl: resolvedCvUrl },
    );
  }

  // 2. Broker request (+ fallback for missing role/level)
  let brokerRequest = params.brokerRequest?.trim() || undefined;
  if (!brokerRequest || !role || !level) {
    const incoming = await runStage(
      'db',
      () =>
        prisma.incomingRequest.findFirst({
          where: { clientName },
          orderBy: { receivedAt: 'desc' },
          select: { brokerRequest: true, role: true, level: true },
        }),
      { op: 'incomingRequest.findFirst', clientName },
    );
    if (incoming) {
      brokerRequest = brokerRequest ?? incoming.brokerRequest ?? undefined;
      role = role ?? incoming.role ?? undefined;
      level = level ?? incoming.level ?? undefined;
    }
  }

  // 3. Client profile (cached aggregation from Sprint 2)
  const clientProfile = await runStage(
    'llm',
    () => buildClientProfile(clientName),
    { op: 'buildClientProfile', clientName },
  );

  await params.onProgress?.('context');

  // 4. RAG: similar interviews — only if we have cvText AND role AND level
  let sourceInterviewIds: string[] = [];
  let similarCases: Array<{ analysis: unknown; decision: string; score?: number }> = [];

  if (cvText && role && level) {
    const vector = await runStage(
      'embed',
      () => embedText(cvText!.slice(0, 2000)),
      { op: 'embedText', inputLength: Math.min(cvText.length, 2000) },
    );

    const ids = await runStage(
      'qdrant',
      () =>
        findSimilarInterviews(
          vector,
          { role: role!, level: level!, clientName },
          5,
        ),
      { op: 'findSimilarInterviews', clientName, role, level },
    );

    if (ids.length > 0) {
      const interviews = await runStage(
        'db',
        () => getInterviewsByIds(ids),
        { op: 'getInterviewsByIds', count: ids.length },
      );

      sourceInterviewIds = interviews.map((i) => i.id);
      similarCases = interviews.map((i) => {
        const a = (i.analysis ?? {}) as Record<string, unknown>;
        const score = typeof a.score === 'number' ? (a.score as number) : undefined;
        return {
          analysis: a,
          decision: i.decision ?? 'unknown',
          score,
        };
      });
    }
  }

  await params.onProgress?.('rag');

  // 5. Build prompts
  const systemPrompt = buildPreparationDocSystemPrompt({
    clientName,
    managerStyles: clientProfile.managerStyles.map((m) => ({
      managerName: m.managerName,
    })),
    technicalFocus: [],
    softSkillsFocus: [],
  });

  const userMessage = buildPreparationDocUserMessage({
    cvText: cvText ?? '',
    brokerRequest: brokerRequest ?? '',
    clientProfile,
    similarCases,
  });

  // 6. LLM call — free-form Markdown, NO response_format
  const response = await runStage(
    'llm',
    () =>
      llmClient.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    { op: 'preparationDoc.llm', candidateName, clientName },
  );

  const choice = response.choices[0];
  const markdown = choice.message.content?.trim() ?? '';

  if (choice.finish_reason === 'length') {
    console.warn('[stage:llm] preparation doc truncated (finish_reason=length)', {
      candidateName,
      clientName,
    });
  }

  if (!markdown) {
    throw new Error('LLM returned empty markdown for preparation doc');
  }

  await params.onProgress?.('llm');

  return { markdown, sourceInterviewIds };
}
