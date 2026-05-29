import axios, { AxiosError } from 'axios';
import type { AnalyzeRequest, CandidateAnalysis, ClientInsights, PreparationDoc, GeneratePreparationDocRequest } from '@shared/schemas';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
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
    limit?: number;
  }) => api.get<InterviewListItem[]>('/interviews', { params: filters }),

  getManagers: () =>
    api.get<string[]>('/interviews/managers'),

  getRoles: () =>
    api.get<string[]>('/interviews/roles'),

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
    reachedCvSent: number;
    totalCvSent: number;
    reachedManagerCall: number;
    reachedTechnical: number;
    reachedFinalResult: number;
    hired: number;
    rejected: number;
    onHold: number;
    conversion: {
      managerCallToTechnical: number;
      technicalToHired: number;
    };
  };
  timing: {
    avgTriageToManagerCallDays: number | null;
    avgManagerToTechnicalDays: number | null;
    avgTechnicalToFinalDays: number | null;
    avgTotalDays: number | null;
    avgDaysToHired: number | null;
    avgTimePerStage: Record<string, number | null>;
    trend: Array<{ month: string; count: number }>;
  };
  quality: {
    topDecisionBreakers: Array<{ text: string; count: number }>;
    topWeaknesses: Array<{ text: string; count: number }>;
    hireRateByRole: Array<{ role: string; hireRate: number; total: number }>;
    topExternalReasons: Array<{ text: string; count: number }>;
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
  totalCvSent: number;
  topStrengths: Array<{ text: string; count: number }>;
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

export interface PipelineCandidateItem {
  id: string;
  candidateName: string | null;
  cvUrl: string;
  level: string | null;
  role: string | null;
  clientName: string | null;
  cvSubmittedAt: string;
  linearIssueId: string;
  interviewCount: number;
  lastStage: string | null;
  lastDecision: string | null;
}

export const pipelineCandidatesApi = {
  getList: (params?: {
    search?: string;
    hasInterviews?: 'yes' | 'no';
    clientName?: string;
    role?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => api.get<PipelineCandidateItem[]>('/pipeline-candidates', { params }),
};

export interface ClientListItem {
  name: string;
  description: string | null;
  interviewCount: number;
  hireRate: number;
  requestCount: number;
  lastInterviewAt: string | null;
}

export interface ClientListResponse {
  total: number;
  page: number;
  limit: number;
  items: ClientListItem[];
}

export interface ClientDetail {
  id: string;
  name: string;
  description: string | null;
  insights: unknown | null;
  createdAt: string;
  updatedAt: string;
  interviewCount: number;
  hireRate: number;
  requestCount: number;
  lastInterviewAt: string | null;
  recentInterviews: Array<{
    id: string;
    candidateName: string | null;
    stage: string;
    decision: string | null;
    score: number | null;
    createdAt: string;
  }>;
  managers: string[];
}

export const clientsApi = {
  getClients: (page = 1, limit = 20) =>
    api.get<ClientListResponse>('/clients', { params: { page, limit } }),

  getClient: (name: string) =>
    api.get<ClientDetail>(`/clients/${encodeURIComponent(name)}`),

  getClientProfile: (name: string) =>
    api.get<ClientInsights>(`/clients/${encodeURIComponent(name)}/profile`),

  rebuildClientProfile: (name: string) =>
    api.post<ClientInsights>(`/clients/${encodeURIComponent(name)}/profile/rebuild`),
};

export const statsApi = {
  getOverview: (params?: { from?: string; to?: string; refresh?: string }) =>
    api.get<StatsOverview>('/stats/overview', { params }),
};

export const uploadApi = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ text: string; filename: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Preparation Doc ────────────────────────────────────────────────────────

export type PreparationDocListItem = Omit<PreparationDoc, 'markdown'>;

export interface PreparationDocStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  progress: number;
  error: string | null;
  doc?: PreparationDoc;
}

export interface PreparationListResponse {
  total: number;
  page: number;
  limit: number;
  items: PreparationDocListItem[];
}

export const preparationApi = {
  generate: (data: GeneratePreparationDocRequest) =>
    api.post<{ id: string; jobId: string }>('/preparation', data),

  getStatus: (id: string) =>
    api.get<PreparationDocStatus>(`/preparation/${encodeURIComponent(id)}/status`),

  getDoc: (id: string) =>
    api.get<PreparationDoc>(`/preparation/${encodeURIComponent(id)}`),

  list: (params?: { page?: number; limit?: number; clientName?: string; candidateName?: string }) =>
    api.get<PreparationListResponse>('/preparation', { params }),

  downloadPdf: (id: string) =>
    api.get<Blob>(`/preparation/${encodeURIComponent(id)}/pdf`, {
      responseType: 'blob',
    }),
};

// ── Linear ─────────────────────────────────────────────────────────────────

export interface LinearVacancy {
  title: string;
  content: string;
  parsedRole: string;
  parsedClientName: string | null;
}

export interface LinearIssuePreview {
  issueId: string;
  identifier: string;
  title: string;
  description: string | null;
  parsedRole: string;
  parsedClientName: string | null;
  attachmentUrl: string | null;
  vacancies: LinearVacancy[];
}

export const linearApi = {
  previewIssue: (idOrUrl: string) =>
    api.post<LinearIssuePreview>('/linear/issue/preview', { idOrUrl }),
};