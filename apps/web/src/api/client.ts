import axios from 'axios';
import type { AnalyzeRequest, CandidateAnalysis, InterviewMeta } from '@shared/schemas';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

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
  analysis: CandidateAnalysis;
  createdAt: string;
}

export interface InterviewDetail extends InterviewListItem {
  transcript: string;
  cvText: string | null;
  brokerRequest: string | null;
  krisLink: string | null;
  linearIssueId: string | null;
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
    page?: number;
  }) => api.get<InterviewListItem[]>('/interviews', { params: filters }),

  getById: (id: string) =>
    api.get<InterviewDetail>(`/interviews/${id}`),

  getStats: () =>
    api.get<InterviewStats>('/interviews/stats'),
};