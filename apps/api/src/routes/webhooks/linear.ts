import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import {
  parseIssue,
  findCandidatesForManagerCall,
  findCandidatesForTechCall,
  findCandidatesForFinalResult,
  extractCvUrlFromComment,
  extractCvAttachmentFromBodyData,
  hasStageHashtag,
  containsHashtag,
  type CandidateThread,
} from '../../services/linear.parser';
import { extractCVText, detectLevelFromCV, extractNameFromCV, extractNameFromTranscript  } from '../../services/cv.service';
import { upsertPipelineCandidateFromCv } from '../../services/pipelineCandidate.service';
import { analyzeQueue } from '../../workers/analyze.worker';
import { cvConsistencyQueue } from '../../workers/cvConsistency.worker';
import { buildWebhookJobId } from '../../utils/dedup';
import { getExistingAnalysesForIssue, upsertIncomingRequest, updateIncomingRequestStatus, reconcileStatusHistory } from '../../db/db.service';
import { prisma } from '../../db/prisma';
import { invalidateStatsCache } from '../../services/statsCache';
import { fetchTranscript } from '../../services/bluedot.service';
import { parseIssueTitle, getComment, splitVacancies, getIssueStatusHistory, wasPostedByUs, isOwnCommentBody } from '../../services/linear.service';
import { matchVacancyToCandidate } from '../../services/vacancyMatcher.service';
import { resolveStage } from '../../services/stageResolver';
import {
  postAnalysisFailureNoticeOnce,
  postCvUnreadableNoticeOnce,
  resolveCvUnreadableNotice,
} from '../../services/linear.poster';
import { assessContentQuality } from '../../utils/contentQuality';


// Троттлинг реконсиляции истории статусов из Linear (см. reconcileHistoryThrottled
// ниже) — не даёт двум почти одновременным вебхукам по одному тикету запустить
// реконсиляцию дважды подряд.
const lastReconciledAt = new Map<string, number>();
const RECONCILE_THROTTLE_MS = 60_000;

// Маркеры, появление которых заставляет пересмотреть стадии тикета. Матчинг —
// через containsHashtag, тот же, которым парсер вытаскивает решение, иначе
// «маркер найден» и «решение распознано» могут разойтись.
const STAGE_MARKERS = [
  '#feedback_manager_call',
  '#manager_call_transcript',
  '#technical_call_transcript',
  '#hired',
  '#lost',
];

// Детект CV работает и в реплаях, а наши же ответы (алерт о расхождении CV,
// уведомление о сбое анализа) содержат внутри ссылку на резюме — без этой
// проверки бот триггерит сам себя: фиктивная карточка в пайплайне, лишний
// инкремент cvSentCount и повторная постановка проверки консистентности.
// Проверка по автору тут не работает — см. комментарий у wasPostedByUs.
async function isOwnComment(commentId: string, body: string): Promise<boolean> {
  return isOwnCommentBody(body) || (await wasPostedByUs(commentId));
}

// Ищет резюме в комментарии: visualcv-ссылка или файл (PDF/DOC/TXT).
// Стадийные комментарии исключаем — транскрипт, приложенный файлом, выглядит
// для детектора ровно как CV (см. hasStageHashtag).
async function detectCvUrl(
  commentId: string,
  body: string,
  fastify: FastifyInstance,
): Promise<string | null> {
  if (hasStageHashtag(body) || (await isOwnComment(commentId, body))) return null;

  const inline = extractCvUrlFromComment(body);
  if (inline) return inline;

  // Webhook-тело не содержит ссылку на файл, приложенный к комментарию — она
  // доступна только через API (body после загрузки + bodyData). Дозапрашиваем
  // лишь когда инлайн-ссылки нет, чтобы не плодить запросы. Тело из API
  // перепроверяем: для загрузки файла вебхук может прийти с пустым body, и
  // хэштег виден только в копии из API.
  try {
    const detail = await getComment(commentId);
    if (detail && !isOwnCommentBody(detail.body) && !hasStageHashtag(detail.body)) {
      return (
        extractCvUrlFromComment(detail.body) ??
        extractCvAttachmentFromBodyData(detail.bodyData)
      );
    }
  } catch (err) {
    fastify.log.warn({ err }, 'Failed to re-fetch comment for CV attachment');
  }
  return null;
}

// Приём найденного резюме: счётчики воронки, карточка пайплайна, проверка
// консистентности. Вызывается и на новый комментарий, и на правку существующего
// — отличаются только флагом countAsSent (см. Comment/update хэндлер).
async function ingestCv(
  opts: {
    issueId: string;
    commentId: string;
    cvUrl: string;
    issueTitle: string;
    countAsSent: boolean;
  },
  fastify: FastifyInstance,
) {
  const { issueId, commentId, cvUrl, issueTitle, countAsSent } = opts;

  if (countAsSent) {
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
  }

  // Инвалидируем кэш статистики, чтобы Candidate Pipeline обновился
  // сразу через SSE, а не только по кнопке "обновить"
  await invalidateStatsCache();

  setImmediate(async () => {
    const req = await prisma.incomingRequest.findUnique({
      where: { linearIssueId: issueId },
      select: { role: true, clientName: true },
    }).catch(() => null);

    const fromTitle = parseIssueTitle(issueTitle);

    const { enriched, cvUnreadable } = await upsertPipelineCandidateFromCv({
      issueId,
      rootCommentId: commentId,
      cvUrl,
      role: req?.role ?? fromTitle.role,
      clientName: req?.clientName ?? fromTitle.clientName,
    });

    // Битая ссылка/неподдержанный формат — карточка есть, но без имени и
    // уровня, и проверка консистентности по ней не пойдёт. Молчать нельзя:
    // кандидат тихо выпадает из контроля, пока ссылку не починят.
    if (cvUnreadable) {
      await postCvUnreadableNoticeOnce(issueId, commentId, cvUrl)
        .catch(err => fastify.log.warn({ err }, 'Failed to post CV-unreadable notice'));
    } else if (enriched) {
      await resolveCvUnreadableNotice(issueId, commentId)
        .catch(err => fastify.log.warn({ err }, 'Failed to resolve CV-unreadable notice'));
    }

    const cvAlertsOn = (process.env.CV_CONSISTENCY_ALERTS ?? 'off').toLowerCase() === 'on';
    fastify.log.info({ rootCommentId: commentId, enriched, cvAlertsOn }, '[cv-consistency] CV ingested, enqueue?');
    if (enriched && cvAlertsOn) {
      await cvConsistencyQueue
        .add(
          'check',
          { rootCommentId: commentId },
          {
            jobId: `cv-consistency-${commentId}`,
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 3600 },
          },
        )
        .then(() => fastify.log.info({ rootCommentId: commentId }, '[cv-consistency] enqueued'))
        .catch((err) => fastify.log.warn({ err }, 'Failed to enqueue cv-consistency'));
    }
  });
}

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

        // Роль и клиента берём из заголовка тикета, который уже лежит в payload.
        // Раньше здесь передавался только linearIssueId, и для тикетов, живших
        // до подключения вебхука (событие Issue/create по ним не приходило),
        // role/clientName в IncomingRequest навсегда оставались null — карточка
        // в пайплайне показывала "—", хотя в анализе роль была (её достаёт
        // parseIssue отдельным путём).
        const issueTitle = data.issue?.title ?? '';
        const titleParts = parseIssueTitle(issueTitle);

        // Создаём запись, если её ещё нет — но не перетираем status,
        // чтобы не писать мусорные переходы в историю при каждом комментарии
        await upsertIncomingRequest({
          linearIssueId: issueId,
          role: titleParts.role || undefined,
          clientName: titleParts.clientName || undefined,
        }).catch(err => fastify.log.warn({ err }, 'Failed to upsert IncomingRequest'));

        fastify.log.info(`Linear: new comment in issue ${issueId}`);

        // CV detection — visualcv-ссылка или CV, приложенный файлом (PDF/DOC/TXT).
        // Любой комментарий, root или реплай: одно найденное резюме = одна
        // карточка пайплайна, ключ — id этого самого комментария.
        const isReply = !!(data.parentId ?? data.parent?.id);
        const cvUrl = await detectCvUrl(data.id, commentBody, fastify);

        if (cvUrl) {
          fastify.log.info({ commentId: data.id, isReply }, 'CV detected');
          await ingestCv({ issueId, commentId: data.id, cvUrl, issueTitle, countAsSent: true }, fastify);
        }

        // Re-evaluate all stages whenever a stage-marker comment lands — this
        // catches the case where the trigger arrives before the matching
        // status (manager_call/technical) or where a #hired/#lost marker is
        // added after the issue is already in Hired/Lost.
        const hasStageMarker = STAGE_MARKERS.some(tag => containsHashtag(commentBody, tag));

        if (hasStageMarker) {
          await evaluateAndTriggerStages(issueId, fastify);
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
            await invalidateStatsCache();
          }
        }

        return reply.status(200).send({ ok: true });
      }

      // ── Триггер на редактирование комментария ───────────────────────────
      // Нужен, чтобы правка битой ссылки на транскрипт/CV (в том же
      // комментарии, а не новым) реально перезапускала анализ — иначе
      // пользователь чинит ссылку, а система об этом не узнаёт.
      if (type === 'Comment' && action === 'update') {
        const commentBody = data.body ?? '';
        const issueId = data.issue?.id;
        fastify.log.info({ commentData: JSON.stringify(data, null, 2) }, 'RAW COMMENT UPDATE PAYLOAD');

        if (issueId) {
          const hasStageMarker = STAGE_MARKERS.some(tag => containsHashtag(commentBody, tag));

          if (hasStageMarker) {
            fastify.log.info(`Linear: comment edited in issue ${issueId} — re-evaluating stages`);
            await evaluateAndTriggerStages(issueId, fastify);
          }

          // Правка комментария с резюме — штатный способ починить нечитаемую
          // ссылку (именно это предлагает postCvUnreadableNoticeOnce). Перечитываем
          // CV, но cvSentCount инкрементим ТОЛЬКО если карточки для этого
          // комментария ещё не было: иначе каждая правка накручивала бы воронку.
          const cvUrl = await detectCvUrl(data.id, commentBody, fastify);
          if (cvUrl) {
            const tracked = await prisma.pipelineCandidate.findUnique({
              where: { rootCommentId: data.id },
              select: { cvUrl: true, cvText: true },
            }).catch(() => null);

            // Вебхук на update приходит и когда тело не менялось — не гоняем
            // скачивание и LLM впустую, если ссылка та же и текст уже извлечён.
            const alreadyIngested = tracked && tracked.cvUrl === cvUrl && !!tracked.cvText;
            if (!alreadyIngested) {
              fastify.log.info({ commentId: data.id, hadCard: !!tracked }, 'CV detected in edited comment');
              await ingestCv(
                { issueId, commentId: data.id, cvUrl, issueTitle: data.issue?.title ?? '', countAsSent: !tracked },
                fastify,
              );
            }
          }
        }

        return reply.status(200).send({ ok: true });
      }

      if (type === 'Issue' && action === 'create') {
        const initialStatus = resolveStage(data.state, fastify.log) ?? 'new';

        await upsertIncomingRequest({
          linearIssueId: data.id,
          clientName: data.team?.name,
          role: data.title,
          status: initialStatus,
        }).catch(err => fastify.log.warn({ err }, 'Failed to create IncomingRequest'));

        await invalidateStatsCache();
      }

      // ── Триггер на смену заголовка Issue (синхронизация clientName) ─────
      if (type === 'Issue' && action === 'update' && updatedFrom?.title !== undefined) {
        const issueId = data.id;
        const newTitle = data.title ?? '';
        const { clientName: rawClientName } = parseIssueTitle(newTitle);
        const newClientName = rawClientName?.trim().toLowerCase() || undefined;

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
            prisma.client.upsert({
              where: { name: newClientName },
              create: { name: newClientName },
              update: {},
            }).catch(err => fastify.log.warn({ err }, 'Failed to upsert Client')),
          ]);

          fastify.log.info(
            `Linear: issue ${issueId} title changed → clientName="${newClientName}" (${requestUpdate.count} requests, ${interviewUpdate.count} interviews updated)`
          );

          await invalidateStatsCache();
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

        // Синхронизируем статус IncomingRequest (и пишем строку истории с
        // реальным временем перехода из Linear, а не моментом обработки вебхука).
        // Резолвим по стабильному id стейта (resolveStage), а не по имени —
        // переименование статуса в Linear не должно ронять историю (см.
        // stageResolver.ts и docs/fix-time-on-stages-plan.md).
        const mappedStatus = resolveStage(data.state, fastify.log);
        if (mappedStatus) {
          const changedAt = data.updatedAt ? new Date(data.updatedAt) : undefined;
          await updateIncomingRequestStatus(issueId, mappedStatus, changedAt);
          await invalidateStatsCache();
        }

        // Реконсилируем локальную историю с Linear в фоне (не блокируя ответ
        // на вебхук) — самолечение на случай пропущенных/рассинхронённых
        // переходов, которые ломают time-on-stage статистику (см.
        // docs/fix-time-on-stages-plan.md, RC-3). Троттлится, чтобы не бить
        // Linear API повторно при всплеске вебхуков по одному тикету.
        reconcileHistoryThrottled(issueId, fastify);

        // Re-evaluate all stages on any analysis-relevant status change —
        // this catches comments that arrived before the status was set
        // (e.g. manager_call transcript posted while issue still in
        // "In Progress", or final markers added before Hired/Lost).
        // Переиспользуем уже разрезолвленный mappedStatus вместо сравнения
        // отображаемого имени — по той же причине, что в evaluateAndTriggerStages.
        if (
          mappedStatus === 'manager_call' ||
          mappedStatus === 'technical' ||
          mappedStatus === 'hired' ||
          mappedStatus === 'lost'
        ) {
          await evaluateAndTriggerStages(issueId, fastify);
        }
      }

    } catch (err) {
      fastify.log.error({ err }, 'Linear webhook processing failed');
    }

    return reply.status(200).send({ ok: true });
  });
}

// Идемпотентно проверяет все три стадии по текущему состоянию тикета и
// ставит в очередь то, что готово и ещё не проанализировано.
// Вызывается и из comment-handler, и из status-handler — при любом событии
// мы пересматриваем полную картину, поэтому порядок прихода коммента и
// смены статуса не влияет на то, запустится ли анализ.
//
// Дедуп-гарантии (уже на месте из предыдущего PR):
//   - стабильный jobId через buildWebhookJobId(issueId, rootCommentId, stage)
//   - уникальный индекс (linearIssueId, parentCommentId, stage) + P2002 recovery
//   - content-hash short-circuit в воркере
// Поэтому двойной вызов при гонке webhook'ов безопасен.
async function evaluateAndTriggerStages(
  issueId: string,
  fastify: FastifyInstance,
) {
  const [parsed, existingAnalyses] = await Promise.all([
    parseIssue(issueId),
    getExistingAnalysesForIssue(issueId),
  ]);

  const notYetAnalyzed = (stage: string) => (c: CandidateThread) => {
    const analyzed = existingAnalyses.get(c.rootCommentId)?.has(stage) ?? false;
    if (analyzed) {
      fastify.log.info(`Skipping ${stage} for ${c.rootCommentId} — already analyzed`);
    }
    return !analyzed;
  };

  const jobs: Promise<unknown>[] = [];

  // Резолвим статус тикета в внутренний ключ по стабильному id стейта, а не
  // сравниваем отображаемое имя строкой. Имена в Linear переименовывают (в
  // проде уже было: "Client Review" → "Client Review (CV)"), а раньше любое
  // расхождение — регистр, суффикс в скобках, типографский апостроф в
  // "Broker's Call" — молча отключало ВСЕ анализы: CV продолжали считаться,
  // а таблица Interview оставалась пустой, и воронка на дашборде показывала нули.
  const stage = resolveStage({ id: parsed.stateId, name: parsed.status }, fastify.log);
  if (!stage) {
    fastify.log.warn(
      { issueId, stateName: parsed.status, stateId: parsed.stateId },
      'Issue status not mapped to a pipeline stage — no analysis will be triggered',
    );
    return;
  }

  if (stage === 'manager_call') {
    const ready = findCandidatesForManagerCall(parsed.candidates)
      .filter(notYetAnalyzed('manager_call'));
    if (ready.length > 0) {
      fastify.log.info(`Manager call: ${ready.length} candidates ready on issue ${issueId}`);
      jobs.push(...ready.map(c => triggerManagerCall(issueId, parsed, c, fastify)));
    }
  }

  if (stage === 'technical') {
    const ready = findCandidatesForTechCall(parsed.candidates)
      .filter(notYetAnalyzed('technical'));
    if (ready.length > 0) {
      fastify.log.info(`Tech call: ${ready.length} candidates ready on issue ${issueId}`);
      jobs.push(...ready.map(c => triggerTechCall(issueId, parsed, c, fastify)));
    }
  }

  if (stage === 'hired' || stage === 'lost') {
    // В одном тикете может быть несколько кандидатов: кого-то реально взяли,
    // кого-то нет. Финальный анализ ставим КАЖДОМУ по его собственному
    // маркеру в треде (#hired → decision=hired, #lost → decision=lost),
    // независимо от того, в какой из двух финальных статусов сам тикет
    // (Hired/Lost у тикета = исход сделки с клиентом, не приговор каждому
    // кандидату). Кандидаты без маркера не анализируются.
    for (const decision of ['hired', 'lost'] as const) {
      const ready = findCandidatesForFinalResult(parsed.candidates, decision)
        .filter(notYetAnalyzed('final_result'));
      if (ready.length > 0) {
        fastify.log.info(`Final result (${decision}): ${ready.length} candidates ready on issue ${issueId}`);
        jobs.push(...ready.map(c => triggerFinalResult(issueId, parsed, c, decision, fastify)));
      }
    }
  }

  await Promise.all(jobs);
}

// Реконсилирует локальную историю статусов тикета с Linear (fire-and-forget,
// вызывающий код не ждёт и не падает при ошибке). Троттлится через
// lastReconciledAt, чтобы всплеск вебхуков по одному тикету (например,
// смена статуса + правка заголовка почти одновременно) не бил Linear API
// повторно на каждый вебхук.
async function reconcileHistoryThrottled(issueId: string, fastify: FastifyInstance) {
  const last = lastReconciledAt.get(issueId) ?? 0;
  const now = Date.now();
  if (now - last < RECONCILE_THROTTLE_MS) return;
  lastReconciledAt.set(issueId, now);

  try {
    const history = await getIssueStatusHistory(issueId, fastify.log);
    await reconcileStatusHistory(issueId, history);
  } catch (err) {
    fastify.log.warn({ err, issueId }, 'Failed to reconcile status history from Linear');
  }
}

// Если в тикете несколько вакансий — выбираем ту, на которую кандидат идёт,
// по его CV и транскрипту. Возвращаем урезанный brokerRequest и название
// выбранной вакансии (для пометки в Linear-комментарии).
// При неудаче или одиночной вакансии — возвращаем исходное описание без пометки.
// Дописывает дополнения из #brokers_request-комментариев к запросу брокера.
// Клеим ПОСЛЕ выбора вакансии (resolveEffectiveBrokerRequest), чтобы не сбить
// разрезание мультивакансий в splitVacancies.
function appendBrokerSupplement(
  brokerRequest: string | undefined,
  supplement: string | null,
): string | undefined {
  if (!supplement?.trim()) return brokerRequest;
  return [brokerRequest, supplement]
    .filter(part => part?.trim())
    .join('\n\n---\n\n');
}

async function resolveEffectiveBrokerRequest(
  brokerRequest: string | undefined,
  cvText: string,
  transcript: string,
  fastify: FastifyInstance,
): Promise<{ brokerRequest: string | undefined; matchedVacancyTitle?: string }> {
  if (!brokerRequest?.trim()) return { brokerRequest };

  const vacancies = splitVacancies(brokerRequest);
  if (vacancies.length < 2) return { brokerRequest };

  try {
    const match = await matchVacancyToCandidate({
      vacancies,
      cvText,
      transcript,
    });
    if (!match || match.confidence === 'low') {
      fastify.log.warn(
        {
          confidence: match?.confidence,
          reasoning: match?.reasoning,
          vacancyCount: vacancies.length,
        },
        '[vacancy-match] low confidence or null — analysing against full description',
      );
      return { brokerRequest };
    }
    const picked = vacancies[match.vacancyIndex];
    fastify.log.info(
      {
        title: picked.title,
        confidence: match.confidence,
        reasoning: match.reasoning,
      },
      '[vacancy-match] candidate matched to vacancy',
    );
    return {
      brokerRequest: picked.content,
      matchedVacancyTitle: picked.title,
    };
  } catch (err) {
    fastify.log.warn({ err }, '[vacancy-match] failed — falling back to full description');
    return { brokerRequest };
  }
}

// CV — вспомогательные данные: если ссылка битая/формат не поддержан,
// сообщаем в Linear, но НЕ блокируем анализ — продолжаем с пустым cvText.
async function extractCvOrNotify(
  cvUrl: string | null,
  issueId: string,
  rootCommentId: string,
  stageLabel: string,
  fastify: FastifyInstance,
): Promise<string> {
  if (!cvUrl) return '';
  try {
    const text = await extractCVText(cvUrl);
    const issue = assessContentQuality(text, 'cv');
    if (issue) {
      fastify.log.warn({ issue }, `CV content looks wrong: ${cvUrl}`);
      await postAnalysisFailureNoticeOnce(issueId, rootCommentId, {
        stageLabel,
        failureStage: 'cv',
        detail: issue,
      });
      return '';
    }
    return text;
  } catch (err) {
    fastify.log.warn({ err }, `Failed to extract CV text: ${cvUrl}`);
    await postAnalysisFailureNoticeOnce(issueId, rootCommentId, {
      stageLabel,
      failureStage: 'cv',
      detail: cvUrl,
    });
    return '';
  }
}

// Транскрипт — основной вход анализа. Раньше на ошибке фетча сюда
// подставлялась заглушка "[Transcript unavailable: ...]" и анализ всё равно
// запускался на этом мусоре, без единого сигнала пользователю. Теперь —
// уведомляем и возвращаем null, чтобы вызывающая сторона пропустила enqueue.
async function fetchTranscriptOrNotify(
  url: string | null,
  issueId: string,
  rootCommentId: string,
  stageLabel: string,
  fastify: FastifyInstance,
): Promise<string | null> {
  if (!url) return '';
  try {
    const text = await fetchTranscript(url);
    const issue = assessContentQuality(text, 'transcript');
    if (issue) {
      fastify.log.warn({ issue }, `Transcript content looks wrong: ${url}`);
      await postAnalysisFailureNoticeOnce(issueId, rootCommentId, {
        stageLabel,
        failureStage: 'transcript',
        detail: issue,
      });
      return null;
    }
    return text;
  } catch (err) {
    fastify.log.warn({ err }, `Failed to fetch transcript: ${url}`);
    await postAnalysisFailureNoticeOnce(issueId, rootCommentId, {
      stageLabel,
      failureStage: 'transcript',
      detail: url,
    });
    return null;
  }
}

// BullMQ дедупит по стабильному jobId — упавшая job с тем же id молча
// блокирует любой повторный .add() до истечения removeOnFail. Чтобы правка
// битой ссылки реально ретраилась, снимаем упавшую job перед повторной
// постановкой (тот же паттерн, что и в routes/analyze.ts).
async function reclaimStaleFailedJob(jobId: string): Promise<void> {
  const existing = await analyzeQueue.getJob(jobId);
  if (!existing) return;
  if ((await existing.getState()) === 'failed') await existing.remove();
}

async function triggerManagerCall(
  issueId: string,
  parsed: any,
  candidate: CandidateThread,
  fastify: FastifyInstance
) {
  try {
    const feedbackIssue = assessContentQuality(candidate.managerFeedback ?? '', 'feedback');
    if (feedbackIssue) {
      fastify.log.warn({ feedbackIssue }, `Manager feedback insufficient for candidate ${candidate.rootCommentId}`);
      await postAnalysisFailureNoticeOnce(issueId, candidate.rootCommentId, {
        stageLabel: 'Manager Call',
        failureStage: 'feedback',
        detail: feedbackIssue,
      });
      return;
    }

    const cvText = await extractCvOrNotify(candidate.cvUrl, issueId, candidate.rootCommentId, 'Manager Call', fastify);

    const transcript = await fetchTranscriptOrNotify(
      candidate.managerCallTranscriptUrl,
      issueId,
      candidate.rootCommentId,
      'Manager Call',
      fastify,
    );
    if (transcript === null) return;

    const [level, nameFromCV] = await Promise.all([
      detectLevelFromCV(cvText),
      extractNameFromCV(cvText),
    ]);
    const candidateName = nameFromCV ? nameFromCV : await extractNameFromTranscript(transcript);

    const { brokerRequest: resolvedBrokerRequest, matchedVacancyTitle } =
      await resolveEffectiveBrokerRequest(
        parsed.brokerRequest,
        cvText,
        transcript,
        fastify,
      );
    const effectiveBrokerRequest = appendBrokerSupplement(
      resolvedBrokerRequest,
      parsed.brokerRequestSupplement,
    );

    const jobId = buildWebhookJobId(issueId, candidate.rootCommentId, 'manager_call');
    await reclaimStaleFailedJob(jobId);

    await analyzeQueue.add(
      'analyze',
      {
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
        brokerRequest: effectiveBrokerRequest,
        additionalContext: {
          managerFeedback: candidate.managerFeedback,
          parentCommentId: candidate.rootCommentId,
          matchedVacancyTitle,
        },
      },
      {
        jobId,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      },
    );

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
    const cvText = await extractCvOrNotify(candidate.cvUrl, issueId, candidate.rootCommentId, 'Technical Call', fastify);

    const transcript = await fetchTranscriptOrNotify(
      candidate.technicalCallTranscriptUrl,
      issueId,
      candidate.rootCommentId,
      'Technical Call',
      fastify,
    );
    if (transcript === null) return;

    const [level, nameFromCV] = await Promise.all([
      detectLevelFromCV(cvText),
      extractNameFromCV(cvText),
    ]);
    const candidateName = nameFromCV ?? await extractNameFromTranscript(transcript);

    const { brokerRequest: resolvedBrokerRequest, matchedVacancyTitle } =
      await resolveEffectiveBrokerRequest(
        parsed.brokerRequest,
        cvText,
        transcript,
        fastify,
      );
    const effectiveBrokerRequest = appendBrokerSupplement(
      resolvedBrokerRequest,
      parsed.brokerRequestSupplement,
    );

    const jobId = buildWebhookJobId(issueId, candidate.rootCommentId, 'technical');
    await reclaimStaleFailedJob(jobId);

    await analyzeQueue.add(
      'analyze',
      {
        transcript,
        meta: {
          stage: 'technical',
          role: parsed.role,
          level,
          clientName: parsed.clientName ?? undefined,
          candidateName: candidateName ?? undefined,
          managerName: candidate.managerName ?? undefined,
          linearIssueId: issueId,
          cvUrl: candidate.cvUrl ?? undefined,
        },
        cvText,
        brokerRequest: effectiveBrokerRequest,
        additionalContext: {
          parentCommentId: candidate.rootCommentId,
          matchedVacancyTitle,
        },
      },
      {
        jobId,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      },
    );

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
    const jobId = buildWebhookJobId(issueId, candidate.rootCommentId, 'final_result');
    await reclaimStaleFailedJob(jobId);

    await analyzeQueue.add(
      'analyze',
      {
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
      },
      {
        jobId,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      },
    );

    fastify.log.info(`Final result queued for candidate ${candidate.rootCommentId}`);
  } catch (err) {
    fastify.log.error({ err }, `Failed to trigger final result for ${candidate.rootCommentId}`);
  }
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  if (!process.env.LINEAR_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', process.env.LINEAR_WEBHOOK_SECRET);
  hmac.update(rawBody);
  return hmac.digest('hex') === signature;
}

function isTimestampFresh(ts: number): boolean {
  return Math.abs(Date.now() - ts) < 60_000;
}