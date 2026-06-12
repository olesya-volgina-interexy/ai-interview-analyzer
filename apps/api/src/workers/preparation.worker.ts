import { Worker, Queue } from 'bullmq';
import { redis } from '../db/redis';
import { prisma } from '../db/prisma';
import { generatePreparationDoc } from '../services/preparationDoc.service';
import { describeError } from '../utils/errorLogger';

export interface PreparationJobData {
  preparationDocId: string;
  candidateName: string;
  clientName: string;
  role?: string;
  linearIssueId?: string;
  cvText?: string;
  cvUrl?: string;
  brokerRequest?: string;
}

export const preparationQueue = new Queue<PreparationJobData>('preparation', {
  connection: redis,
});

export const preparationWorker = new Worker<PreparationJobData>(
  'preparation',
  async (job) => {
    const {
      preparationDocId,
      candidateName,
      clientName,
      cvText,
      cvUrl,
      brokerRequest,
    } = job.data;

    try {
      await job.updateProgress(10);
      console.log(`[preparation] start job ${job.id}`, {
        preparationDocId,
        candidateName,
        clientName,
        hasCvText: !!cvText,
        hasCvUrl: !!cvUrl,
        hasBrokerRequest: !!brokerRequest,
      });

      const { markdown, sourceInterviewIds } = await generatePreparationDoc({
        candidateName,
        clientName,
        role: job.data.role,
        linearIssueId: job.data.linearIssueId,
        cvText,
        cvUrl,
        brokerRequest,
        onProgress: async (stage) => {
          if (stage === 'context') await job.updateProgress(25);
          else if (stage === 'cv') await job.updateProgress(45);
          else if (stage === 'client') await job.updateProgress(65);
          else if (stage === 'llm') await job.updateProgress(85);
        },
      });

      await job.updateProgress(90);

      await prisma.preparationDoc.update({
        where: { id: preparationDocId },
        data: {
          markdown,
          sourceInterviewIds,
          status: 'completed',
        },
      });

      await job.updateProgress(100);

      return {
        preparationDocId,
        sourceInterviewCount: sourceInterviewIds.length,
      };
    } catch (err) {
      console.error(`[preparation] failed job ${job.id}`, {
        ...describeError(err),
        preparationDocId,
        candidateName,
        clientName,
      });

      const message = err instanceof Error ? err.message : String(err);
      await prisma.preparationDoc
        .update({
          where: { id: preparationDocId },
          data: { status: 'failed', error: message },
        })
        .catch((updateErr) => {
          console.error(
            '[preparation] failed to mark doc as failed',
            describeError(updateErr),
          );
        });

      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

preparationWorker.on('completed', (job) => {
  console.log(`Preparation completed: job ${job.id}`);
});

preparationWorker.on('failed', (job, err) => {
  console.error(`Preparation failed: job ${job?.id}`, {
    ...describeError(err),
    jobId: job?.id,
    preparationDocId: (job?.data as PreparationJobData | undefined)?.preparationDocId,
    candidateName: (job?.data as PreparationJobData | undefined)?.candidateName,
    clientName: (job?.data as PreparationJobData | undefined)?.clientName,
  });
});
