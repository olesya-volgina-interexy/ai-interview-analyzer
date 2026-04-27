import { Worker, Queue } from 'bullmq';
import { embedText, buildEmbeddingText } from '../services/embedding.service';
import { findSimilarInterviews, saveEmbedding } from '../services/rag.service';
import { analyzeInterview, analyzeFinalResult } from '../services/llm.service';
import { extractCVText, detectLevelFromCV, extractNameFromCV } from '../services/cv.service';
import {
  createInterview,
  getInterviewsByIds,
  updateEmbeddingId,
  getInterviewsByLinearIssueId,
  findInterviewByContentHash,
} from '../db/db.service';
import { buildContentHash } from '../utils/dedup';
import { formatSimilarCases } from '../prompts/analyze.prompt';
import {
  postManagerCallAnalysis,
  postTechnicalAnalysis,
  postFinalResult,
} from '../services/linear.poster';
import type { AnalyzeRequest } from '@shared/schemas';
import { runStage, describeError } from '../utils/errorLogger';

import { redis } from '../db/redis';
export { redis };

export const analyzeQueue = new Queue('analyze', { connection: redis });

export const analyzeWorker = new Worker<AnalyzeRequest & {
  cvText?: string;
  additionalContext?: {
    parentCommentId?: string;
    managerFeedback?: string;
    finalDecision?: 'hired' | 'lost';
    cvUrl?: string;
    brokerRequest?: string;
  };
}>(
  'analyze',
  async (job) => {
    const { transcript, meta, additionalContext } = job.data;
    const { parentCommentId, finalDecision } = additionalContext ?? {};

    // ── Финальный анализ (отдельный флоу) ────────────────────────────────
    if ((meta as any).stage === 'final_result') {
      await job.updateProgress(10);

      // Подтягиваем предыдущие анализы из БД по linearIssueId
      const previousAnalyses = meta.linearIssueId
        ? await runStage(
            'db',
            () => getInterviewsByLinearIssueId(meta.linearIssueId!, ['manager_call', 'technical']),
            { op: 'getInterviewsByLinearIssueId', linearIssueId: meta.linearIssueId }
          )
        : [];

      if (previousAnalyses.length === 0) {
        console.warn(`No previous analyses found for issue ${meta.linearIssueId} - skipping final result analysis`);
        return;
      }

      // Берём имя кандидата из предыдущих анализов
      if (!meta.candidateName) {
        const nameFromPrevious = previousAnalyses.find(a => a.candidateName)?.candidateName;
        if (nameFromPrevious) meta.candidateName = nameFromPrevious;
      }

      const previousContext = previousAnalyses
        .map(a => `=== ${a.stage.toUpperCase()} ===\n${JSON.stringify(a.analysis, null, 2)}`)
        .join('\n\n');

      await job.updateProgress(40);

      const analysis = await runStage(
        'llm',
        () => analyzeFinalResult(previousContext, finalDecision ?? 'lost'),
        { op: 'analyzeFinalResult', linearIssueId: meta.linearIssueId }
      );

      await job.updateProgress(80);

      // Сохранить финальный анализ в БД
      const { interview, isDuplicate } = await runStage(
        'db',
        () => createInterview({ transcript: '', meta, analysis, parentCommentId }),
        { op: 'createInterview.final', linearIssueId: meta.linearIssueId }
      );

      if (isDuplicate) {
        console.log(
          `Final result for issue ${meta.linearIssueId} / ${parentCommentId} already saved by a concurrent worker — skipping Linear post.`
        );
        await job.updateProgress(100);
        return { interviewId: interview.id, analysis, deduped: true };
      }

      // Постинг в Linear
      if (meta.linearIssueId && parentCommentId) {
        try {
          await runStage(
            'linear',
            () => postFinalResult(
              meta.linearIssueId!,
              parentCommentId,
              analysis,
              finalDecision ?? 'lost'
            ),
            { op: 'postFinalResult', linearIssueId: meta.linearIssueId, parentCommentId }
          );
        } catch {
          // уже залогировали, не ломаем основной флоу
        }
      }

      await job.updateProgress(100);
      return { interviewId: interview.id, analysis };
    }

    // ── Стандартный анализ (manager_call / technical) ─────────────────────

    // Шаг 1: CV
    await job.updateProgress(10);
    let cvText = job.data.cvText;
    if (!cvText && meta.cvUrl) {
      cvText = await runStage(
        'cv',
        () => extractCVText(meta.cvUrl!),
        { op: 'extractCVText', cvUrl: meta.cvUrl }
      );
    }
    if (cvText && !meta.candidateName) {
      const extractedName = await runStage(
        'cv',
        () => extractNameFromCV(cvText!),
        { op: 'extractNameFromCV' }
      );
      if (extractedName) meta.candidateName = extractedName;
    }

    // Добавляем фидбек менеджера к транскрипции если есть
    const managerFeedback = additionalContext?.managerFeedback;
    const fullTranscript = managerFeedback
      ? `${transcript}\n\n[Manager Feedback]: ${managerFeedback}`
      : transcript;

    const brokerRequest = job.data.brokerRequest
      ?? additionalContext?.brokerRequest
      ?? meta.brokerRequest;

    // Шаг 1.5: Content-hash dedup — если тот же транскрипт (+cv+broker) уже
    // анализировался в этом тикете под другим parentCommentId, не тратим
    // LLM-вызов и не постим повторно.
    const contentHash = buildContentHash(fullTranscript, cvText, brokerRequest);
    if (meta.linearIssueId) {
      const existing = await runStage(
        'db',
        () => findInterviewByContentHash(
          meta.linearIssueId!,
          (meta as any).stage,
          contentHash,
        ),
        { op: 'findInterviewByContentHash', linearIssueId: meta.linearIssueId, stage: (meta as any).stage }
      );
      if (existing) {
        console.log(
          `Identical content already analysed for issue ${meta.linearIssueId} (existing interview ${existing.id}, parentCommentId ${existing.parentCommentId}) — skipping LLM + Linear post.`
        );
        await job.updateProgress(100);
        return { interviewId: existing.id, deduped: true };
      }
    }

    // Шаг 2: Эмбеддинг
    await job.updateProgress(25);
    const embeddingText = buildEmbeddingText(fullTranscript, cvText, brokerRequest);
    const vector = await runStage(
      'embed',
      () => embedText(embeddingText),
      { op: 'embedText', inputLength: embeddingText.length }
    );

    // Шаг 3: RAG — поиск похожих кейсов
    await job.updateProgress(40);
    const similarIds = await runStage(
      'qdrant',
      () => findSimilarInterviews(vector, {
        role: meta.role,
        level: meta.level,
        stage: (meta as any).stage,
        clientName: meta.clientName,
      }),
      { op: 'findSimilarInterviews', role: meta.role, level: meta.level }
    );

    let similarCasesText: string | undefined;
    if (similarIds.length > 0) {
      const similarCases = await runStage(
        'db',
        () => getInterviewsByIds(similarIds),
        { op: 'getInterviewsByIds', count: similarIds.length }
      );
      similarCasesText = formatSimilarCases(
        similarCases.map(c => ({
          stage: c.stage,
          meta: { role: c.role, level: c.level },
          analysis: c.analysis as Record<string, unknown>,
        }))
      );
    }

    // Шаг 4: LLM анализ
    await job.updateProgress(55);
    const analysis = await runStage(
      'llm',
      () => analyzeInterview(fullTranscript, meta, {
        cvText,
        brokerRequest,
        similarCases: similarCasesText,
      }),
      { op: 'analyzeInterview', stage: (meta as any).stage, role: meta.role, level: meta.level }
    );

    // Шаг 5: Сохранить в PostgreSQL
    const questions = (analysis as any).questions ?? [];
    await job.updateProgress(80);
    const { interview, isDuplicate } = await runStage(
      'db',
      () => createInterview({
        transcript: fullTranscript,
        meta,
        analysis,
        cvText,
        brokerRequest,
        parentCommentId,
        questions,
        contentHash,
      }),
      { op: 'createInterview', stage: (meta as any).stage, linearIssueId: meta.linearIssueId }
    );

    if (isDuplicate) {
      console.log(
        `Interview for issue ${meta.linearIssueId} / ${parentCommentId} already saved by a concurrent worker — skipping embedding + Linear post.`
      );
      await job.updateProgress(100);
      return { interviewId: interview.id, analysis, deduped: true };
    }

    // Шаг 6: Сохранить вектор в Qdrant
    await runStage(
      'qdrant',
      () => saveEmbedding(interview.id, vector, {
        role: meta.role,
        level: meta.level,
        stage: (meta as any).stage,
        decision: meta.decision ?? 'unknown',
        clientName: meta.clientName,
      }),
      { op: 'saveEmbedding', interviewId: interview.id }
    );
    await runStage(
      'db',
      () => updateEmbeddingId(interview.id, interview.id),
      { op: 'updateEmbeddingId', interviewId: interview.id }
    );

    // Шаг 7: Постинг в Linear
    if (meta.linearIssueId && parentCommentId) {
      try {
        if (analysis.stage === 'manager_call') {
          await runStage(
            'linear',
            () => postManagerCallAnalysis(meta.linearIssueId!, parentCommentId, analysis),
            { op: 'postManagerCallAnalysis', linearIssueId: meta.linearIssueId, parentCommentId }
          );
        } else if (analysis.stage === 'technical') {
          await runStage(
            'linear',
            () => postTechnicalAnalysis(meta.linearIssueId!, parentCommentId, analysis),
            { op: 'postTechnicalAnalysis', linearIssueId: meta.linearIssueId, parentCommentId }
          );
        }
      } catch {
        // уже залогировали в runStage, не ломаем основной флоу
      }
    }

    await job.updateProgress(100);
    return { interviewId: interview.id, analysis };
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

analyzeWorker.on('completed', job => {
  console.log(`Analysis completed: job ${job.id}`);
});

analyzeWorker.on('failed', (job, err) => {
  console.error(`Analysis failed: job ${job?.id}`, {
    ...describeError(err),
    jobId: job?.id,
    linearIssueId: (job?.data as any)?.meta?.linearIssueId,
    stage: (job?.data as any)?.meta?.stage,
  });
});
