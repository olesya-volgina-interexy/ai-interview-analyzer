import { prisma } from '../db/prisma';
import type { InterviewMeta, CandidateAnalysis } from '@shared/schemas';

// Создать запись интервью
export async function createInterview(data: {
  transcript: string;
  meta: InterviewMeta;
  analysis: CandidateAnalysis;
  cvText?: string;
  brokerRequest?: string;
  parentCommentId?: string;
}) {
  return prisma.interview.create({
    data: {
      transcript: data.transcript,
      cvText: data.cvText,
      brokerRequest: data.brokerRequest,
      parentCommentId: data.parentCommentId,
      stage: data.meta.stage,
      role: data.meta.role,
      level: data.meta.level,
      decision: data.meta.decision as string,
      clientName: data.meta.clientName,
      candidateName: data.meta.candidateName,
      comments: data.meta.interviewerComments,
      krisLink: data.meta.krisLink,
      cvUrl: data.meta.cvUrl,
      linearIssueId: data.meta.linearIssueId,
      analysis: data.analysis as object,
    },
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
}) {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;

  return prisma.interview.findMany({
    where: {
      ...(filters?.role && { role: filters.role }),
      ...(filters?.level && { level: filters.level }),
      ...(filters?.stage && { stage: filters.stage }),
      ...(filters?.clientName && { clientName: filters.clientName }),
      ...(filters?.decision && { decision: filters.decision }),
    },
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
      analysis: true,
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
    },
  });
}