import axios, { AxiosError } from 'axios';
import type { AnalyzeRequest, CandidateAnalysis } from '@shared/schemas';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Глобальный перехватчик ошибок ──────────────────────────────────────────

api.interceptors.response.use(
  res => res,
  (error: AxiosError) => {
    if (!error.response) {
      // Нет соединения с сервером
      throw new ApiError('Unable to connect to the server. Please check that the API is running.', 'NETWORK_ERROR');
    }

    const status = error.response.status;
    const data = error.response.data as any;

    switch (status) {
      case 400:
        throw new ApiError(data?.message ?? 'Invalid request data. Please check the form.', 'VALIDATION_ERROR');
      case 404:
        throw new ApiError('Resource not found.', 'NOT_FOUND');
      case 429:
        throw new ApiError('Too many requests. Please wait a moment and try again.', 'RATE_LIMIT');
      case 500:
        throw new ApiError('Server error. Please try again later.', 'SERVER_ERROR');
      default:
        throw new ApiError(`Unexpected error (${status}). Please try again.`, 'UNKNOWN_ERROR');
    }
  }
);

// ── ApiError класс ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public code: 'NETWORK_ERROR' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'UNKNOWN_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred. Please try again.';
}

// ── Типы ответов ───────────────────────────────────────────────────────────

export interface JobStatus {
  jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: {
    interviewId: string;
    analysis: CandidateAnalysis;
  };
}

export interface InterviewListItem {
  id: string;
  stage: string;
  role: string;
  level: string;
  decision: string | null;
  clientName: string | null;
  candidateName: string | null;
  managerName: string | null;
  analysis: CandidateAnalysis;
  createdAt: string;
}

export interface InterviewDetail extends InterviewListItem {
  transcript: string;
  cvText: string | null;
  brokerRequest: string | null;
  krisLink: string | null;
  linearIssueId: string | null;
  questions: Array<{ question: string; topic?: string; candidateHandled?: string }> | null;
}

export interface InterviewStats {
  total: number;
  hireRate: number;
  avgScore: number;
  byRole: Record<string, number>;
  byStage: Record<string, number>;
}

// ── API методы ─────────────────────────────────────────────────────────────

export const analyzeApi = {
  start: (data: AnalyzeRequest) =>
    api.post<{ jobId: string }>('/analyze', data),

  getStatus: (jobId: string) =>
    api.get<JobStatus>(`/analyze/${jobId}/status`),
};

export const interviewsApi = {
  getList: (filters?: {
    role?: string;
    level?: string;
    stage?: string;
    clientName?: string;
    decision?: string;
    managerName?: string;
    page?: number;
  }) => api.get<InterviewListItem[]>('/interviews', { params: filters }),

  getManagers: () =>
    api.get<string[]>('/interviews/managers'),

  getById: (id: string) =>
    api.get<InterviewDetail>(`/interviews/${id}`),

  getStats: () =>
    api.get<InterviewStats>('/interviews/stats'),

  delete: (id: string) =>
    api.delete(`/interviews/${id}`),
};

export interface StatsOverview {
  period: { from: string; to: string };
  requests: {
    total: number;
    byStatus: Record<string, number>;
    byClient: Record<string, number>;
    byRole: Record<string, number>;
  };
  pipeline: {
    reachedManagerCall: number;
    reachedTechnical: number;
    reachedFinalResult: number;
    hired: number;
    rejected: number;
    conversion: {
      managerCallToTechnical: number;
      technicalToHired: number;
    };
  };
  timing: {
    avgManagerToTechnicalDays: number | null;
    avgTechnicalToFinalDays: number | null;
    avgTotalDays: number | null;
    trend: Array<{ month: string; count: number }>;
  };
  quality: {
    topDecisionBreakers: Array<{ text: string; count: number }>;
    topWeaknesses: Array<{ text: string; count: number }>;
    hireRateByRole: Array<{ role: string; hireRate: number; total: number }>;
  };
  candidates: {
    avgScoreByLevel: Array<{ level: string; avgScore: number }>;
    avgScoreByRole: Array<{ role: string; avgScore: number }>;
  };
}

export interface CandidateListItem {
  candidateName: string;
  totalInterviews: number;
  successful: number;
  failed: number;
  lastInterviewAt: string;
  roles: string[];
  avgScore: number | null;
}

export interface CandidateDetail {
  candidateName: string;
  totalInterviews: number;
  successful: number;
  failed: number;
  avgScore: number | null;
  roles: string[];
  topWeaknesses: Array<{ text: string; count: number }>;
  topDecisionBreakers: Array<{ text: string; count: number }>;
  interviews: Array<{
    id: string;
    stage: string;
    role: string;
    level: string;
    decision: string | null;
    clientName: string | null;
    managerName: string | null;
    createdAt: string;
    recommendation: string | null;
    stageResult: string | null;
    score: number | null;
  }>;
}

export const candidatesApi = {
  getList: (params?: { search?: string; page?: number; limit?: number; role?: string; result?: 'hired' | 'not_hired' }) =>
    api.get<CandidateListItem[]>('/candidates', { params }),

  getByName: (name: string) =>
    api.get<CandidateDetail>(`/candidates/${encodeURIComponent(name)}`),
};

export const statsApi = {
  getOverview: (params?: { from?: string; to?: string }) =>
    api.get<StatsOverview>('/stats/overview', { params }),
};