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

// Точные названия статусов в Linear (уточнить у ментора если отличаются)
const STATUS_BROKERS_CALL = "Broker's Call";
const STATUS_TECH_CALL = 'Tech Call';
const STATUS_HIRED = 'Hired';
const STATUS_LOST = 'Lost';

export async function linearWebhookRoutes(fastify: FastifyInstance) {

  // Получаем raw body для верификации подписи
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => done(null, body)
  );

  fastify.post('/webhooks/linear', async (request, reply) => {
    const rawBody = request.body as string;
    const signature = request.headers['linear-signature'] as string;

    // Верификация подписи
    if (!verifySignature(rawBody, signature)) {
      fastify.log.warn('Invalid Linear webhook signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);

    // Защита от replay атак
    if (!isTimestampFresh(payload.webhookTimestamp)) {
      fastify.log.warn('Stale Linear webhook');
      return reply.status(400).send({ error: 'Stale webhook' });
    }

    const { action, type, data, updatedFrom } = payload;

    // Обрабатываем только Issue update события со сменой статуса
    if (type !== 'Issue' || action !== 'update' || !updatedFrom?.stateId || !data.state) {
      return reply.status(200).send({ ok: true });
    }

    const newStatus = data.state.name;
    const issueId = data.id;

    fastify.log.info(`Linear: issue ${issueId} → "${newStatus}"`);

    try {
      const parsed = await parseIssue(issueId);

      if (newStatus === STATUS_BROKERS_CALL) {
        // Триггер 1: анализ менеджер-колла
        const candidates = findCandidatesForManagerCall(parsed.candidates);
        fastify.log.info(`Manager call candidates ready: ${candidates.length}`);

        await Promise.all(
          candidates.map(c => triggerManagerCall(issueId, parsed, c, fastify))
        );

      } else if (newStatus === STATUS_TECH_CALL) {
        // Триггер 2: анализ технического интервью
        const candidates = findCandidatesForTechCall(parsed.candidates);
        fastify.log.info(`Tech call candidates ready: ${candidates.length}`);

        await Promise.all(
          candidates.map(c => triggerTechCall(issueId, parsed, c, fastify))
        );

      } else if (newStatus === STATUS_HIRED || newStatus === STATUS_LOST) {
        // Триггер 3: финальный анализ для всех кандидатов с хэштегом
        const decision = newStatus === STATUS_HIRED ? 'hired' : 'lost';
        const candidates = findCandidatesForFinalResult(parsed.candidates, decision);
        fastify.log.info(`Final result candidates (${decision}): ${candidates.length}`);

        await Promise.all(
          candidates.map(c => triggerFinalResult(issueId, parsed, c, decision, fastify))
        );
      }

    } catch (err) {
      fastify.log.error({ err, issueId }, 'Linear webhook processing failed');
      // Возвращаем 200 чтобы Linear не делал retry — логируем ошибку внутри
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
    // Скачиваем CV и определяем уровень
    const cvText = candidate.cvUrl
      ? await extractCVText(candidate.cvUrl)
      : '';

    const level = await detectLevelFromCV(cvText);

    // Транскрипция — пока заглушка для Bluedot
    // TODO: заменить на fetchTranscriptFromUrl(candidate.managerCallTranscriptUrl)
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

    // Транскрипция — пока заглушка для Bluedot
    // TODO: заменить на fetchTranscriptFromUrl(candidate.technicalCallTranscriptUrl)
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
        // decision НЕ передаём — объективный анализ без результата
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
      transcript: '', // для финального анализа транскрипция не нужна
      meta: {
        stage: 'final_result' as any,
        role: parsed.role,
        level: 'Middle', // для финального анализа уровень не критичен
        decision: decision === 'hired' ? 'hired' : 'rejected',
        clientName: parsed.clientName ?? undefined,
        linearIssueId: issueId,
      },
      additionalContext: {
        parentCommentId: candidate.rootCommentId,
        finalDecision: decision,
        cvUrl: candidate.cvUrl,
        brokerRequest: parsed.brokerRequest,
      },
    });

    fastify.log.info(`Final result queued for candidate ${candidate.rootCommentId}`);
  } catch (err) {
    fastify.log.error({ err }, `Failed to trigger final result for ${candidate.rootCommentId}`);
  }
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  if (!process.env.LINEAR_WEBHOOK_SECRET) return true; // dev без секрета
  const hmac = crypto.createHmac('sha256', process.env.LINEAR_WEBHOOK_SECRET);
  hmac.update(rawBody);
  return hmac.digest('hex') === signature;
}

function isTimestampFresh(ts: number): boolean {
  return Math.abs(Date.now() - ts) < 60_000;
}