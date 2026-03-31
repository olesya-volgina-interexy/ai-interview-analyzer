import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { embedText, buildEmbeddingText } from '../services/embedding.service';
import { findSimilarInterviews, saveEmbedding } from '../services/rag.service';
import { analyzeInterview } from '../services/llm.service';
import { extractCVText } from '../services/cv.service';
import { createInterview, getInterviewsByIds, updateEmbeddingId } from '../db/db.service';
import { formatSimilarCases } from '../prompts/analyze.prompt';
import type { AnalyzeRequest } from '@shared/schemas';

export const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const analyzeQueue = new Queue('analyze', { connection: redis });

export const analyzeWorker = new Worker<AnalyzeRequest>(
  'analyze',
  async (job) => {
    const { transcript, meta, cvText: cvTextFromRequest, brokerRequest: brokerFromRequest } = job.data;

    // Шаг 1: CV
    await job.updateProgress(10);
    let cvText = cvTextFromRequest;
    if (!cvText && meta.cvUrl) {
      cvText = await extractCVText(meta.cvUrl);
    }

    // Шаг 2: Запрос брокера
    const brokerRequest = brokerFromRequest ?? meta.brokerRequest;

    // Шаг 3: Эмбеддинг
    await job.updateProgress(25);
    const embeddingText = buildEmbeddingText(transcript, cvText, brokerRequest);
    const vector = await embedText(embeddingText);
    console.log('Vector length:', vector.length);

    // Шаг 4: RAG
    await job.updateProgress(40);
    const similarIds = await findSimilarInterviews(vector, {
      role: meta.role,
      level: meta.level,
      stage: meta.stage,
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

    // Шаг 5: LLM анализ
    await job.updateProgress(55);
    const analysis = await analyzeInterview(transcript, meta, {
      cvText,
      brokerRequest,
      similarCases: similarCasesText,
    });

    // Шаг 6: Сохранить в PostgreSQL
    await job.updateProgress(80);
    const interview = await createInterview({
      transcript, meta, analysis, cvText, brokerRequest
    });

    // Шаг 7: Сохранить вектор в Qdrant
    await saveEmbedding(interview.id, vector, {
      role: meta.role,
      level: meta.level,
      stage: meta.stage,
      decision: meta.decision ?? 'unknown',
      clientName: meta.clientName,
    });
    await updateEmbeddingId(interview.id, interview.id);

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