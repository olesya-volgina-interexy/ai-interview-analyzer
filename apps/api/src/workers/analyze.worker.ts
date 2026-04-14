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
} from '../db/db.service';
import { formatSimilarCases } from '../prompts/analyze.prompt';
import {
  postManagerCallAnalysis,
  postTechnicalAnalysis,
  postFinalResult,
} from '../services/linear.poster';
import type { AnalyzeRequest } from '@shared/schemas';

export { redis } from '../db/redis';

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
        ? await getInterviewsByLinearIssueId(meta.linearIssueId, ['manager_call', 'technical'])
        : [];

      if (previousAnalyses.length === 0) {
        console.warn(`No previous analyses found for issue ${meta.linearIssueId} - skipping final result analysis`);
        return;
      }

      const previousContext = previousAnalyses
        .map(a => `=== ${a.stage.toUpperCase()} ===\n${JSON.stringify(a.analysis, null, 2)}`)
        .join('\n\n');

      await job.updateProgress(40);

      const analysis = await analyzeFinalResult(
        previousContext,
        finalDecision ?? 'lost'
      );

      await job.updateProgress(80);

      // Сохранить финальный анализ в БД
      const interview = await createInterview({
        transcript: '',
        meta,
        analysis,
      });

      // Постинг в Linear
      if (meta.linearIssueId && parentCommentId) {
        try {
          await postFinalResult(
            meta.linearIssueId,
            parentCommentId,
            analysis,
            finalDecision ?? 'lost'
          );
        } catch (err) {
          console.error('Failed to post final result to Linear:', err);
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
      cvText = await extractCVText(meta.cvUrl);
    }
    if (cvText && !meta.candidateName) {
      const extractedName = await extractNameFromCV(cvText);
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

    // Шаг 2: Эмбеддинг
    await job.updateProgress(25);
    const embeddingText = buildEmbeddingText(fullTranscript, cvText, brokerRequest);
    const vector = await embedText(embeddingText);

    // Шаг 3: RAG — поиск похожих кейсов
    await job.updateProgress(40);
    const similarIds = await findSimilarInterviews(vector, {
      role: meta.role,
      level: meta.level,
      stage: (meta as any).stage,
      clientName: meta.clientName,
    });

    let similarCasesText: string | undefined;
    if (similarIds.length > 0) {
      const similarCases = await getInterviewsByIds(similarIds);
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
    const analysis = await analyzeInterview(fullTranscript, meta, {
      cvText,
      brokerRequest,
      similarCases: similarCasesText,
    });

    // Шаг 5: Сохранить в PostgreSQL
    const questions = (analysis as any).questions ?? [];
    await job.updateProgress(80);
    const interview = await createInterview({
      transcript: fullTranscript,
      meta,
      analysis,
      cvText,
      brokerRequest,
      parentCommentId,
      questions,
    });

    // Шаг 6: Сохранить вектор в Qdrant
    await saveEmbedding(interview.id, vector, {
      role: meta.role,
      level: meta.level,
      stage: (meta as any).stage,
      decision: meta.decision ?? 'unknown',
      clientName: meta.clientName,
    });
    await updateEmbeddingId(interview.id, interview.id);

    // Шаг 7: Постинг в Linear
    if (meta.linearIssueId && parentCommentId) {
      try {
        if (analysis.stage === 'manager_call') {
          await postManagerCallAnalysis(meta.linearIssueId, parentCommentId, analysis);
        } else if (analysis.stage === 'technical') {
          await postTechnicalAnalysis(meta.linearIssueId, parentCommentId, analysis);
        }
      } catch (err) {
        console.error('Failed to post analysis to Linear:', err);
        // Не ломаем основной флоу
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
  console.error(`Analysis failed: job ${job?.id}`, err.message);
});