// apps/api/src/routes/webhooks/linear.ts

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import {
  parseIssue,
  findCandidatesForManagerCall,
  findCandidatesForTechCall,
  findCandidatesForFinalResult,
  type CandidateThread,
} from '../../services/linear.parser';
import { extractCVText, detectLevelFromCV } from '../../services/cv.service';
import { analyzeQueue } from '../../workers/analyze.worker';

const STATUS_BROKERS_CALL = "Broker's Call";
const STATUS_TECH_CALL = 'Tech Call';
const STATUS_HIRED = 'Hired';
const STATUS_LOST = 'Lost';

export async function linearWebhookRoutes(fastify: FastifyInstance) {

  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => done(null, body)
  );

  fastify.post('/webhooks/linear', async (request, reply) => {
    const rawBody = request.body as string;
    const signature = request.headers['linear-signature'] as string;

    if (!verifySignature(rawBody, signature)) {
      fastify.log.warn('Invalid Linear webhook signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);

    if (!isTimestampFresh(payload.webhookTimestamp)) {
      fastify.log.warn('Stale Linear webhook');
      return reply.status(400).send({ error: 'Stale webhook' });
    }

    const { action, type, data, updatedFrom } = payload;

    try {

      // ── Триггер на новый комментарий ────────────────────────────────────
      if (type === 'Comment' && action === 'create') {
        const commentBody = data.body ?? '';
        const issueId = data.issue?.id;

        if (!issueId) return reply.status(200).send({ ok: true });

        fastify.log.info(`Linear: new comment in issue ${issueId}`);

        // Manager call — появился фидбек или транскрипция
        if (
          commentBody.includes('#feedback_manager_call') ||
          commentBody.includes('#manager_call_transcript')
        ) {
          const parsed = await parseIssue(issueId);
          if (parsed.status === STATUS_BROKERS_CALL) {
            const candidates = findCandidatesForManagerCall(parsed.candidates);
            fastify.log.info(`Manager call candidates ready: ${candidates.length}`);
            await Promise.all(
              candidates.map(c => triggerManagerCall(issueId, parsed, c, fastify))
            );
          }
        }

        // Technical call — появилась транскрипция технички
        if (commentBody.includes('#technical_call_transcript')) {
          const parsed = await parseIssue(issueId);
          if (parsed.status === STATUS_TECH_CALL) {
            const candidates = findCandidatesForTechCall(parsed.candidates);
            fastify.log.info(`Tech call candidates ready: ${candidates.length}`);
            await Promise.all(
              candidates.map(c => triggerTechCall(issueId, parsed, c, fastify))
            );
          }
        }

        return reply.status(200).send({ ok: true });
      }

      // ── Триггер на смену статуса Issue ──────────────────────────────────
      if (type === 'Issue' && action === 'update' && updatedFrom?.stateId && data.state) {
        const newStatus = data.state.name;
        const issueId = data.id;

        fastify.log.info(`Linear: issue ${issueId} → "${newStatus}"`);

        const parsed = await parseIssue(issueId);

        // Hired / Lost — финальный анализ
        if (newStatus === STATUS_HIRED || newStatus === STATUS_LOST) {
          const decision = newStatus === STATUS_HIRED ? 'hired' : 'lost';
          const candidates = findCandidatesForFinalResult(parsed.candidates, decision);
          fastify.log.info(`Final result candidates (${decision}): ${candidates.length}`);
          await Promise.all(
            candidates.map(c => triggerFinalResult(issueId, parsed, c, decision, fastify))
          );
        }
      }

    } catch (err) {
      fastify.log.error({ err }, 'Linear webhook processing failed');
    }

    return reply.status(200).send({ ok: true });
  });
}

// ── Триггеры анализов ─────────────────────────────────────────────────────

async function triggerManagerCall(
  issueId: string,
  parsed: any,
  candidate: CandidateThread,
  fastify: FastifyInstance
) {
  try {
    const cvText = candidate.cvUrl
      ? await extractCVText(candidate.cvUrl)
      : '';

    const level = await detectLevelFromCV(cvText);

    // TODO: заменить на fetchTranscriptFromUrl когда будет доступ к Bluedot
    const transcript = `[Transcript from Bluedot: ${candidate.managerCallTranscriptUrl}]`;

    await analyzeQueue.add('analyze', {
      transcript,
      meta: {
        stage: 'manager_call',
        role: parsed.role,
        level,
        clientName: parsed.clientName ?? undefined,
        linearIssueId: issueId,
        cvUrl: candidate.cvUrl ?? undefined,
      },
      cvText,
      brokerRequest: parsed.brokerRequest ?? undefined,
      additionalContext: {
        managerFeedback: candidate.managerFeedback,
        parentCommentId: candidate.rootCommentId,
      },
    });

    fastify.log.info(`Manager call queued for candidate ${candidate.rootCommentId}`);
  } catch (err) {
    fastify.log.error({ err }, `Failed to trigger manager call for ${candidate.rootCommentId}`);
  }
}

async function triggerTechCall(
  issueId: string,
  parsed: any,
  candidate: CandidateThread,
  fastify: FastifyInstance
) {
  try {
    const cvText = candidate.cvUrl
      ? await extractCVText(candidate.cvUrl)
      : '';

    const level = await detectLevelFromCV(cvText);

    // TODO: заменить на fetchTranscriptFromUrl когда будет доступ к Bluedot
    const transcript = `[Transcript from Bluedot: ${candidate.technicalCallTranscriptUrl}]`;

    await analyzeQueue.add('analyze', {
      transcript,
      meta: {
        stage: 'technical',
        role: parsed.role,
        level,
        clientName: parsed.clientName ?? undefined,
        linearIssueId: issueId,
        cvUrl: candidate.cvUrl ?? undefined,
      },
      cvText,
      brokerRequest: parsed.brokerRequest ?? undefined,
      additionalContext: {
        parentCommentId: candidate.rootCommentId,
      },
    });

    fastify.log.info(`Tech call queued for candidate ${candidate.rootCommentId}`);
  } catch (err) {
    fastify.log.error({ err }, `Failed to trigger tech call for ${candidate.rootCommentId}`);
  }
}

async function triggerFinalResult(
  issueId: string,
  parsed: any,
  candidate: CandidateThread,
  decision: 'hired' | 'lost',
  fastify: FastifyInstance
) {
  try {
    await analyzeQueue.add('analyze', {
      transcript: '',
      meta: {
        stage: 'final_result' as any,
        role: parsed.role,
        level: 'Middle',
        decision: decision === 'hired' ? 'hired' : 'rejected',
        clientName: parsed.clientName ?? undefined,
        linearIssueId: issueId,
      },
      additionalContext: {
        parentCommentId: candidate.rootCommentId,
        finalDecision: decision,
      },
    });

    fastify.log.info(`Final result queued for candidate ${candidate.rootCommentId}`);
  } catch (err) {
    fastify.log.error({ err }, `Failed to trigger final result for ${candidate.rootCommentId}`);
  }
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  if (!process.env.LINEAR_WEBHOOK_SECRET) return true;
  const hmac = crypto.createHmac('sha256', process.env.LINEAR_WEBHOOK_SECRET);
  hmac.update(rawBody);
  return hmac.digest('hex') === signature;
}

function isTimestampFresh(ts: number): boolean {
  return Math.abs(Date.now() - ts) < 60_000;
}