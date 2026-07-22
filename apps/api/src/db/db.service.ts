import { Prisma, type Interview } from '@prisma/client';
import { prisma } from '../db/prisma';
import type { InterviewMeta, CandidateAnalysis } from '@shared/schemas';
import { invalidateStatsCache } from '../services/statsCache';
import { stripNullBytes, stripNullBytesDeep } from '../utils/textSanitize';

// Выводим итоговое решение (hired/rejected) для колонки Interview.decision.
// Раньше его задавал пользователь в форме; теперь форма этого поля не имеет,
// поэтому берём решение из результата анализа LLM. Колонка используется
// статистикой пайплайна (hired/rejected) и таблицей/фильтром интервью.
function deriveDecision(
  meta: InterviewMeta,
  analysis: CandidateAnalysis,
): 'hired' | 'rejected' | null {
  // Явно переданное решение имеет приоритет (на случай будущих вызывающих).
  if (meta.decision) return meta.decision;
  if (analysis.stage === 'technical') {
    if (analysis.recommendation === 'hire') return 'hired';
    if (analysis.recommendation === 'no_hire') return 'rejected';
    return null; // uncertain
  }
  if (analysis.stage === 'final_result') return analysis.decision;
  return null; // manager_call — как и раньше, решение не выставляется
}

// Создать запись интервью.
// Returns { isDuplicate: true } when a concurrent worker already persisted the
// same (linearIssueId, parentCommentId, stage) — callers should skip any
// non-idempotent side effects (Linear post, embedding upsert) in that case.
export async function createInterview(data: {
  transcript: string;
  meta: InterviewMeta;
  analysis: CandidateAnalysis;
  cvText?: string;
  brokerRequest?: string;
  parentCommentId?: string;
  questions?: Array<{ question: string; topic?: string; candidateHandled?: string }>;
  contentHash?: string;
}): Promise<{ interview: Interview; isDuplicate: boolean }> {
  try {
    // Strip null bytes (\0) from every text field — Postgres rejects them in
    // TEXT/JSONB columns. Sources include PDF extraction, Puppeteer-rendered
    // content, Linear uploads, and pasted text. Safety net even if upstream
    // sanitisers missed any path.
    const interview = await prisma.interview.create({
      data: {
        transcript: stripNullBytes(data.transcript),
        cvText: data.cvText ? stripNullBytes(data.cvText) : undefined,
        brokerRequest: data.brokerRequest ? stripNullBytes(data.brokerRequest) : undefined,
        parentCommentId: data.parentCommentId,
        stage: data.meta.stage,
        role: stripNullBytes(data.meta.role),
        level: data.meta.level,
        decision: deriveDecision(data.meta, data.analysis),
        analysisDate: data.meta.analysisDate ? new Date(data.meta.analysisDate) : undefined,
        clientName: data.meta.clientName ? stripNullBytes(data.meta.clientName) : undefined,
        candidateName: data.meta.candidateName ? stripNullBytes(data.meta.candidateName) : undefined,
        comments: data.meta.interviewerComments ? stripNullBytes(data.meta.interviewerComments) : undefined,
        krisLink: data.meta.krisLink,
        cvUrl: data.meta.cvUrl,
        linearIssueId: data.meta.linearIssueId,
        managerName: data.meta.managerName ? stripNullBytes(data.meta.managerName) : undefined,
        analysis: stripNullBytesDeep(data.analysis) as object,
        questions: data.questions ? (stripNullBytesDeep(data.questions) as object[]) : undefined,
        contentHash: data.contentHash,
      },
    });

    // Инвалидируем кеш статистики
    await invalidateStatsCache();

    return { interview, isDuplicate: false };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError
      && err.code === 'P2002'
      && data.meta.linearIssueId
      && data.parentCommentId
    ) {
      const existing = await prisma.interview.findFirst({
        where: {
          linearIssueId: data.meta.linearIssueId,
          parentCommentId: data.parentCommentId,
          stage: data.meta.stage,
        },
      });
      if (existing) return { interview: existing, isDuplicate: true };
    }
    throw err;
  }
}

// Returns an existing Interview with the same content fingerprint, so we can
// skip the LLM call when the same transcript is reposted under a different
// parentCommentId.
export async function findInterviewByContentHash(
  linearIssueId: string,
  stage: string,
  contentHash: string,
) {
  return prisma.interview.findFirst({
    where: { linearIssueId, stage, contentHash },
    select: { id: true, parentCommentId: true },
  });
}

// Получить список интервью с фильтрами
export async function getInterviews(filters?: {
  role?: string;
  level?: string;
  stage?: string;
  clientName?: string;
  decision?: string;
  page?: number;
  limit?: number;
  managerName?: string;
}) {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;

  const where: Prisma.InterviewWhereInput = {
    ...(filters?.role && { role: filters.role }),
    ...(filters?.level && { level: filters.level }),
    ...(filters?.stage && { stage: filters.stage }),
    ...(filters?.clientName && { clientName: { contains: filters.clientName, mode: 'insensitive' } }),
  };

  if (filters?.managerName === '__uncertain__') {
    where.managerName = null;
  } else if (filters?.managerName) {
    where.managerName = filters.managerName;
  }

  // 'uncertain' result lives inside analysis JSON (technical recommendation),
  // while 'hired'/'rejected' are stored on the Interview row as `decision`.
  if (filters?.decision === 'uncertain') {
    where.analysis = { path: ['recommendation'], equals: 'uncertain' };
  } else if (filters?.decision) {
    where.decision = filters.decision;
  }

  return prisma.interview.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      stage: true,
      role: true,
      level: true,
      decision: true,
      clientName: true,
      candidateName: true,
      managerName: true,
      analysis: true,
      analysisDate: true,
      createdAt: true,
    },
  });
}

// Получить одно интервью по ID
export async function getInterviewById(id: string) {
  return prisma.interview.findUnique({ where: { id } });
}

// Получить несколько интервью по массиву ID (для RAG few-shot)
export async function getInterviewsByIds(ids: string[]) {
  return prisma.interview.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      stage: true,
      role: true,
      level: true,
      decision: true,
      analysis: true,
    },
  });
}

// Обновить embeddingId после сохранения в Qdrant
export async function updateEmbeddingId(interviewId: string, embeddingId: string) {
  return prisma.interview.update({
    where: { id: interviewId },
    data: { embeddingId },
  });
}

export async function getInterviewsByLinearIssueId(
  linearIssueId: string,
  stages: string[]
) {
  return prisma.interview.findMany({
    where: {
      linearIssueId,
      stage: { in: stages },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      stage: true,
      role: true,
      level: true,
      analysis: true,
      candidateName: true,
    },
  });
}

/**
 * Получает все существующие анализы для тикета (batch проверка)
 * @returns Map: parentCommentId -> Set of stages
 */
export async function getExistingAnalysesForIssue(
  linearIssueId: string
): Promise<Map<string, Set<string>>> {
  const analyses = await prisma.interview.findMany({
    where: { linearIssueId },
    select: {
      parentCommentId: true,
      stage: true,
    },
  });

  const result = new Map<string, Set<string>>();

  for (const analysis of analyses) {
    if (!analysis.parentCommentId) continue;

    if (!result.has(analysis.parentCommentId)) {
      result.set(analysis.parentCommentId, new Set());
    }
    result.get(analysis.parentCommentId)!.add(analysis.stage);
  }

  return result;
}

// ── IncomingRequest ────────────────────────────────────────────────────────

export async function upsertIncomingRequest(data: {
  linearIssueId: string;
  clientName?: string;
  role?: string;
  level?: string;
  brokerRequest?: string;
  status?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.incomingRequest.findUnique({
      where: { linearIssueId: data.linearIssueId },
      select: { id: true, status: true },
    });

    if (!existing) {
      const initialStatus = data.status ?? 'new';
      const created = await tx.incomingRequest.create({
        data: {
          linearIssueId: data.linearIssueId,
          clientName: data.clientName,
          role: data.role,
          level: data.level,
          brokerRequest: data.brokerRequest,
          status: initialStatus,
          statusHistory: {
            create: { status: initialStatus },
          },
        },
      });
      return created;
    }

    const statusChanged = data.status !== undefined && data.status !== existing.status;

    return tx.incomingRequest.update({
      where: { id: existing.id },
      data: {
        ...(data.clientName && { clientName: data.clientName }),
        ...(data.role && { role: data.role }),
        ...(statusChanged && { status: data.status }),
        ...(statusChanged && {
          statusHistory: { create: { status: data.status! } },
        }),
      },
    });
  });
}

export async function updateIncomingRequestStatus(
  linearIssueId: string,
  status: string,
  enteredAt?: Date
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.incomingRequest.findUnique({
      where: { linearIssueId },
      select: { id: true, status: true },
    });
    if (!existing || existing.status === status) return existing;

    return tx.incomingRequest.update({
      where: { id: existing.id },
      data: {
        status,
        statusHistory: { create: { status, ...(enteredAt && { enteredAt }) } },
      },
    });
  });
}

// Дополняет локальную историю статусов версией из Linear — СЛИЯНИЕМ, а не
// заменой. Локальное зеркало пишется по вебхукам и может отставать/терять
// переходы (пропущенный вебхук, гонка, ручная правка статуса); эта функция
// должна закрывать такие пробелы. Но Linear API `issue.history` устраняется
// не мгновенно — если реконсиляция срабатывает сразу после вебхука (см.
// reconcileHistoryThrottled в webhooks/linear.ts), запрос к Linear может
// вернуть ИСТОРИЮ БЕЗ только что случившегося перехода, который сам вебхук
// уже корректно записал локально. Раньше эта функция полностью УДАЛЯЛА
// локальные строки и заменяла их ответом Linear — из-за этой гонки свежий,
// верный переход стирался неполным снимком. Поэтому здесь СЛИЯНИЕ: локальные
// строки, которых нет в ответе Linear, никогда не отбрасываются — Linear
// может только ДОБАВИТЬ то, чего не хватает локально, никогда не удалить то,
// что уже записано. `history` должна прийти отсортированной от старых к
// новым (см. getIssueStatusHistory в linear.service.ts).
export async function reconcileStatusHistory(
  linearIssueId: string,
  history: Array<{ status: string; enteredAt: string }>
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.incomingRequest.findUnique({
      where: { linearIssueId },
      select: { id: true },
    });
    if (!existing) return;

    const localRows = await tx.incomingRequestStatusHistory.findMany({
      where: { incomingRequestId: existing.id },
      select: { status: true, enteredAt: true },
    });

    const merged = [
      ...localRows.map(r => ({ status: r.status, enteredAt: r.enteredAt.getTime() })),
      ...history.map(r => ({ status: r.status, enteredAt: new Date(r.enteredAt).getTime() })),
    ].sort((a, b) => a.enteredAt - b.enteredAt);

    if (merged.length === 0) return;

    // Дедуп подряд идущих одинаковых статусов (из двух источников, локального
    // и Linear, могло прийти по записи на один и тот же реальный переход) —
    // оставляем самую раннюю известную отметку времени для этого визита.
    const deduped = merged.filter((entry, i) => i === 0 || entry.status !== merged[i - 1].status);

    await tx.incomingRequestStatusHistory.deleteMany({
      where: { incomingRequestId: existing.id },
    });

    await tx.incomingRequestStatusHistory.createMany({
      data: deduped.map(entry => ({
        incomingRequestId: existing.id,
        status: entry.status,
        enteredAt: new Date(entry.enteredAt),
      })),
    });

    const latestStatus = deduped[deduped.length - 1].status;
    await tx.incomingRequest.update({
      where: { id: existing.id },
      data: { status: latestStatus },
    });
  });
}
