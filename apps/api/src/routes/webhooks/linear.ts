import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import {
  parseIssue,
  findCandidatesForManagerCall,
  findCandidatesForTechCall,
  findCandidatesForFinalResult,
  extractCVUrl,
  type CandidateThread,
} from '../../services/linear.parser';
import { extractCVText, detectLevelFromCV, extractNameFromCV, extractNameFromTranscript  } from '../../services/cv.service';
import { analyzeQueue } from '../../workers/analyze.worker';
import { getExistingAnalysesForIssue, upsertIncomingRequest, updateIncomingRequestStatus } from '../../db/db.service';
import { prisma } from '../../db/prisma';
import { redis } from '../../db/redis';
import { fetchTranscript } from '../../services/bluedot.service';
import { parseIssueTitle } from '../../services/linear.service';


const STATUS_TRIAGE = 'Triage';
const STATUS_IN_PROGRESS = 'In Progress';
const STATUS_CLIENT_REVIEW = 'Client Review';
const STATUS_BROKERS_CALL = "Broker's Call";
const STATUS_TECH_CALL = 'Tech Call';
const STATUS_HIRED = 'Hired';
const STATUS_LOST = 'Lost';
const STATUS_ON_HOLD = 'On Hold';

const LINEAR_STATUS_MAP: Record<string, string> = {
  [STATUS_TRIAGE]: 'triage',
  [STATUS_IN_PROGRESS]: 'in_progress',
  [STATUS_CLIENT_REVIEW]: 'client_review',
  [STATUS_BROKERS_CALL]: 'manager_call',
  [STATUS_TECH_CALL]: 'technical',
  [STATUS_HIRED]: 'hired',
  [STATUS_LOST]: 'lost',
  [STATUS_ON_HOLD]: 'on_hold',
};

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
        fastify.log.info({ commentData: JSON.stringify(data, null, 2) }, 'RAW COMMENT PAYLOAD');
        const issueId = data.issue?.id;

        if (!issueId) return reply.status(200).send({ ok: true });

        // Создаём запись, если её ещё нет — но не перетираем status,
        // чтобы не писать мусорные переходы в историю при каждом комментарии
        await upsertIncomingRequest({
          linearIssueId: issueId,
        }).catch(err => fastify.log.warn({ err }, 'Failed to upsert IncomingRequest'));

        fastify.log.info(`Linear: new comment in issue ${issueId}`);

        // CV detection — трекаем отправку CV (только root-комментарии)
        const hasCVLink = commentBody.includes('my.visualcv.com') ||
          commentBody.toLowerCase().includes('visualcv');
        const isRootComment = !data.parent?.id;

        if (hasCVLink && issueId && isRootComment) {
          await prisma.incomingRequest.updateMany({
            where: {
              linearIssueId: issueId,
              status: { in: ['new', 'in_progress'] },
            },
            data: {
              status: 'cv_sent',
              cvSentCount: { increment: 1 },
            },
          }).catch(err => fastify.log.warn({ err }, 'Failed to update cv_sent status'));

          // Increment count even if status already beyond cv_sent
          await prisma.incomingRequest.updateMany({
            where: {
              linearIssueId: issueId,
              status: { notIn: ['new', 'in_progress'] },
            },
            data: {
              cvSentCount: { increment: 1 },
            },
          }).catch(err => fastify.log.warn({ err }, 'Failed to increment cv count'));
          if (isRootComment) {
            const cvUrl = extractCVUrl(commentBody);
            if (cvUrl) {
              setImmediate(async () => {
                try {
                  const cvText = await extractCVText(cvUrl);
                  const [candidateName, level] = await Promise.all([
                    extractNameFromCV(cvText),
                    detectLevelFromCV(cvText),
                  ]);

                  const req = await prisma.incomingRequest.findUnique({
                    where: { linearIssueId: issueId },
                    select: { role: true, clientName: true },
                  });

                  await prisma.pipelineCandidate.upsert({
                    where: { rootCommentId: data.id },
                    create: {
                      linearIssueId: issueId,
                      rootCommentId: data.id,
                      candidateName: candidateName ?? undefined,
                      level: level ?? undefined,
                      cvUrl,
                      cvText,
                      role: req?.role ?? undefined,
                      clientName: req?.clientName ?? undefined,
                    },
                    update: {
                      cvUrl,
                      cvText,
                      candidateName: candidateName ?? undefined,
                      level: level ?? undefined,
                    },
                  });
                } catch (err) {
                  fastify.log.warn({ err }, 'Failed to create PipelineCandidate');
                }
              });
            }
          }
        }

        // Получаем существующие анализы ОДИН РАЗ для всего тикета
        const existingAnalyses = await getExistingAnalysesForIssue(issueId);

        // Manager call — появился фидбек или транскрипция
        if (
          commentBody.includes('#feedback_manager_call') ||
          commentBody.includes('#manager_call_transcript')
        ) {
          const parsed = await parseIssue(issueId);
          if (parsed.status === STATUS_BROKERS_CALL) {
            const candidates = findCandidatesForManagerCall(parsed.candidates);
            
            // Фильтруем кандидатов у которых ещё нет анализа
            const candidatesToAnalyze = candidates.filter(c => {
              const existingStages = existingAnalyses.get(c.rootCommentId);
              const alreadyAnalyzed = existingStages?.has('manager_call') ?? false;
              
              if (alreadyAnalyzed) {
                fastify.log.info(`Skipping manager_call for ${c.rootCommentId} — already analyzed`);
              }
              return !alreadyAnalyzed;
            });

            fastify.log.info(`Manager call candidates: ${candidates.length} total, ${candidatesToAnalyze.length} to analyze`);

            await Promise.all(
              candidatesToAnalyze.map(c => triggerManagerCall(issueId, parsed, c, fastify))
            );
          }
        }

        // Technical call — появилась транскрипция технички
        if (commentBody.includes('#technical_call_transcript')) {
          const parsed = await parseIssue(issueId);
          if (parsed.status === STATUS_TECH_CALL) {
            const candidates = findCandidatesForTechCall(parsed.candidates);
            
            // Фильтруем кандидатов у которых ещё нет анализа
            const candidatesToAnalyze = candidates.filter(c => {
              const existingStages = existingAnalyses.get(c.rootCommentId);
              const alreadyAnalyzed = existingStages?.has('technical') ?? false;
              
              if (alreadyAnalyzed) {
                fastify.log.info(`Skipping technical for ${c.rootCommentId} — already analyzed`);
              }
              return !alreadyAnalyzed;
            });

            fastify.log.info(`Tech call candidates: ${candidates.length} total, ${candidatesToAnalyze.length} to analyze`);

            await Promise.all(
              candidatesToAnalyze.map(c => triggerTechCall(issueId, parsed, c, fastify))
            );
          }
        }

        // External feedback — причина закрытия/потери не связанная с кандидатом
        if (commentBody.includes('#feedback') && !commentBody.includes('#feedback_manager_call')) {
          const feedbackText = commentBody
            .replace(/#feedback/g, '')
            .replace(/\[#feedback\]\(<#feedback>\)/g, '')
            .trim();
          if (feedbackText && issueId) {
            await prisma.incomingRequest.updateMany({
              where: { linearIssueId: issueId },
              data: { externalFeedback: feedbackText },
            }).catch(err => fastify.log.warn({ err }, 'Failed to save external feedback'));

            // Инвалидируем кэш статистики
            const keys = await redis.keys('stats:overview:*').catch(() => [] as string[]);
            if (keys.length > 0) await redis.del(...keys).catch(() => {});
          }
        }

        return reply.status(200).send({ ok: true });
      }

      if (type === 'Issue' && action === 'create') {
        const initialStatus = data.state?.name
          ? (LINEAR_STATUS_MAP[data.state.name] ?? 'new')
          : 'new';

        await upsertIncomingRequest({
          linearIssueId: data.id,
          clientName: data.team?.name,
          role: data.title,
          status: initialStatus,
        }).catch(err => fastify.log.warn({ err }, 'Failed to create IncomingRequest'));
      }

      // ── Триггер на смену заголовка Issue (синхронизация clientName) ─────
      if (type === 'Issue' && action === 'update' && updatedFrom?.title !== undefined) {
        const issueId = data.id;
        const newTitle = data.title ?? '';
        const { clientName: newClientName } = parseIssueTitle(newTitle);

        if (newClientName) {
          const [requestUpdate, interviewUpdate] = await Promise.all([
            prisma.incomingRequest.updateMany({
              where: { linearIssueId: issueId },
              data: { clientName: newClientName },
            }),
            prisma.interview.updateMany({
              where: { linearIssueId: issueId },
              data: { clientName: newClientName },
            }),
            prisma.pipelineCandidate.updateMany({
              where: { linearIssueId: issueId },
              data: { clientName: newClientName },
            }).catch(err => fastify.log.warn({ err }, 'Failed to update PipelineCandidate clientName')),
          ]);

          fastify.log.info(
            `Linear: issue ${issueId} title changed → clientName="${newClientName}" (${requestUpdate.count} requests, ${interviewUpdate.count} interviews updated)`
          );

          const keys = await redis.keys('stats:overview:*').catch(() => [] as string[]);
          if (keys.length > 0) await redis.del(...keys).catch(() => {});
        } else {
          fastify.log.info(
            `Linear: issue ${issueId} title changed to "${newTitle}" but no client extracted — skip`
          );
        }
      }

      // ── Триггер на смену статуса Issue ──────────────────────────────────
      if (type === 'Issue' && action === 'update' && updatedFrom?.stateId && data.state) {
        const newStatus = data.state.name;
        const issueId = data.id;

        fastify.log.info(`Linear: issue ${issueId} → "${newStatus}"`);

        // Синхронизируем статус IncomingRequest (и пишем строку истории)
        if (LINEAR_STATUS_MAP[newStatus]) {
          await updateIncomingRequestStatus(issueId, LINEAR_STATUS_MAP[newStatus]);
        }

        // Получаем существующие анализы
        const existingAnalyses = await getExistingAnalysesForIssue(issueId);
        const parsed = await parseIssue(issueId);

        // Hired / Lost — финальный анализ
        if (newStatus === STATUS_HIRED || newStatus === STATUS_LOST) {
          const decision = newStatus === STATUS_HIRED ? 'hired' : 'lost';
          const candidates = findCandidatesForFinalResult(parsed.candidates, decision);
          
          // Фильтруем кандидатов у которых ещё нет финального анализа
          const candidatesToAnalyze = candidates.filter(c => {
            const existingStages = existingAnalyses.get(c.rootCommentId);
            const alreadyAnalyzed = existingStages?.has('final_result') ?? false;
            
            if (alreadyAnalyzed) {
              fastify.log.info(`Skipping final_result for ${c.rootCommentId} — already analyzed`);
            }
            return !alreadyAnalyzed;
          });

          fastify.log.info(`Final result candidates (${decision}): ${candidates.length} total, ${candidatesToAnalyze.length} to analyze`);

          await Promise.all(
            candidatesToAnalyze.map(c => triggerFinalResult(issueId, parsed, c, decision, fastify))
          );
        }
      }

    } catch (err) {
      fastify.log.error({ err }, 'Linear webhook processing failed');
    }

    return reply.status(200).send({ ok: true });
  });
}

async function triggerManagerCall(
  issueId: string,
  parsed: any,
  candidate: CandidateThread,
  fastify: FastifyInstance
) {
  try {
    const cvText = candidate.cvUrl ? await extractCVText(candidate.cvUrl) : '';

    // Реальный фетч транскрипции
    let transcript = '';
    if (candidate.managerCallTranscriptUrl) {
      try {
        transcript = await fetchTranscript(candidate.managerCallTranscriptUrl);
      } catch (err) {
        fastify.log.warn(
          { err },
          `Failed to fetch manager call transcript: ${candidate.managerCallTranscriptUrl}`
        );
        transcript = `[Transcript unavailable: ${candidate.managerCallTranscriptUrl}]`;
      }
    }

    const [level, nameFromCV] = await Promise.all([
      detectLevelFromCV(cvText),
      extractNameFromCV(cvText),
    ]);
    const candidateName = nameFromCV ? nameFromCV : await extractNameFromTranscript(transcript);

    await analyzeQueue.add('analyze', {
      transcript,
      meta: {
        stage: 'manager_call',
        role: parsed.role,
        level,
        clientName: parsed.clientName ?? undefined,
        candidateName: candidateName ?? undefined,
        managerName: candidate.managerName ?? undefined,
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
    const cvText = candidate.cvUrl ? await extractCVText(candidate.cvUrl) : '';

    // Реальный фетч транскрипции
    let transcript = '';
    if (candidate.technicalCallTranscriptUrl) {
      try {
        transcript = await fetchTranscript(candidate.technicalCallTranscriptUrl);
      } catch (err) {
        fastify.log.warn(
          { err },
          `Failed to fetch tech call transcript: ${candidate.technicalCallTranscriptUrl}`
        );
        transcript = `[Transcript unavailable: ${candidate.technicalCallTranscriptUrl}]`;
      }
    }

    const [level, nameFromCV] = await Promise.all([
      detectLevelFromCV(cvText),
      extractNameFromCV(cvText),
    ]);
    const candidateName = nameFromCV ?? await extractNameFromTranscript(transcript);

    await analyzeQueue.add('analyze', {
      transcript,
      meta: {
        stage: 'technical',
        role: parsed.role,
        level,
        clientName: parsed.clientName ?? undefined,
        candidateName: candidateName ?? undefined,
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