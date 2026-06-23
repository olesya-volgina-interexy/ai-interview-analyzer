import { Worker, Queue } from 'bullmq';
import { redis } from '../db/redis';
import { runCvConsistencyCheck } from '../services/cvConsistency.service';
import { describeError } from '../utils/errorLogger';

export interface CvConsistencyJobData {
  rootCommentId: string;
}

export const cvConsistencyQueue = new Queue<CvConsistencyJobData>('cv-consistency', {
  connection: redis,
});

export const cvConsistencyWorker = new Worker<CvConsistencyJobData>(
  'cv-consistency',
  async (job) => {
    console.log('[cv-consistency] worker received job', { jobId: job.id, rootCommentId: job.data.rootCommentId });
    await runCvConsistencyCheck(job.data.rootCommentId);
  },
  { connection: redis, concurrency: 1 },
);

cvConsistencyWorker.on('failed', (job, err) => {
  console.error('[cv-consistency] job failed', {
    ...describeError(err),
    rootCommentId: (job?.data as CvConsistencyJobData | undefined)?.rootCommentId,
  });
});
