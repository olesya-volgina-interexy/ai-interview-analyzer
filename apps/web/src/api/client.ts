import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AnalyzeRequest, CandidateAnalysis, ClientInsights, PreparationDoc, GeneratePreparationDocRequest, ChangePasswordRequest, AdminResetPasswordRequest, UpdateProfileRequest, AuthUser } from '@shared/schemas';

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single in-flight refresh shared across concurrent 401s. Resolves to the new
// access token, or null if refresh failed.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const r = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${BASE_URL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    );
    localStorage.setItem('accessToken', r.data.accessToken);
    localStorage.setItem('refreshToken', r.data.refreshToken);
    return r.data.accessToken;
  } catch {
    return null;
  }
}

function forceLogout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    if (!error.response) {
      throw new ApiError('Unable to connect to the server. Please check that the API is running.', 'NETWORK_ERROR');
    }

    const status = error.response.status;
    const data = error.response.data as any;
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (status === 401 && original && !original._retried && !original.url?.includes('/auth/refresh') && !original.url?.includes('/auth/login')) {
      original._retried = true;
      refreshInFlight = refreshInFlight ?? refreshAccessToken().finally(() => { refreshInFlight = null; });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
      forceLogout();
      throw new ApiError('Session expired. Please log in again.', 'UNAUTHORIZED');
    }

    switch (status) {
      case 400:
        throw new ApiError(data?.message ?? 'Invalid request data. Please check the form.', 'VALIDATION_ERROR');
      case 401:
        forceLogout();
        throw new ApiError('Session expired. Please log in again.', 'UNAUTHORIZED');
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

export class ApiError extends Error {
  constructor(
    message: string,
    public code: 'NETWORK_ERROR' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'UNKNOWN_ERROR' | 'UNAUTHORIZED'
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
  analysisDate: string | null;
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

export const analyzeApi = {
  start: (data: AnalyzeRequest) =>
    api.post<{ jobId: string }>('/analyze', data),

  getStatus: (jobId: string) =>
    api.get<JobStatus>(`/analyze/${jobId}/status`),
};

export const authApi = {
  updateProfile: (data: UpdateProfileRequest) =>
    api.patch<AuthUser>('/auth/profile', data),

  changePassword: (data: ChangePasswordRequest) =>
    api.post<{ success: boolean }>('/auth/change-password', data),

  adminResetPassword: (data: AdminResetPasswordRequest) =>
    api.post<{ success: boolean; email: string }>('/auth/admin/reset-password', data),
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

  update: (id: string, data: { candidateName?: string; managerName?: string }) =>
    api.patch<InterviewDetail>(`/interviews/${id}`, data),

  downloadPdf: (id: string) =>
    api.get<Blob>(`/interviews/${id}/pdf`, { responseType: 'blob' }),

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
    stages: Array<{
      key: string;
      label: string;
      avgDaysCompleted: number | null;
      completedCount: number;
      currentOccupancy: number;
      avgDaysInFlight: number | null;
      skippedCount: number;
      regressionInCount: number;
      regressionOutCount: number;
      revisitCount: number;
    }>;
    transitions: Array<{
      from: string;
      to: string;
      count: number;
      avgDays: number | null;
      kind: 'step' | 'skip' | 'regression' | 'exit' | 'reopen';
      skipsOver: string[];
    }>;
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
    analysisDate: string | null;
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
  aliases: string[];
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

  mergeClients: (canonicalName: string, aliases: string[]) =>
    api.post<{ canonicalName: string; aliases: string[] }>('/clients/merge', {
      canonicalName,
      aliases,
    }),

  unmergeClients: (aliases: string[]) =>
    api.post<{ removed: number }>('/clients/unmerge', { aliases }),
};

export const statsApi = {
  getOverview: (params?: { from?: string; to?: string; refresh?: string }) =>
    api.get<StatsOverview>('/stats/overview', { params }),
  // EventSource can't send an Authorization header, so the token travels as
  // a query param here — the API verifies it itself for this one route
  // (see apps/api/src/routes/statsStream.ts). Returns null if there's no
  // token yet (e.g. logged out) so callers can skip connecting.
  getStreamUrl: (): string | null => {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    return `${BASE_URL}/stats/stream?token=${encodeURIComponent(token)}`;
  },
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

export interface LinearIssueItem {
  id: string;
  title: string;
  stateName: string;
  role: string;
  clientName: string | null;
}

export interface PreparationItem {
  id: string;
  candidateName: string;
  linearIssueId: string;
  linearIssueTitle: string;
  preparationDate: string;
  type: 'message' | 'call' | 'call_setup';
  recency: 'fresh' | 'aging' | 'stale';
  sessionCount: number;
  hasInterviews: boolean;
  createdAt: string;
  updatedAt: string;
}

export const preparationsApi = {
  create: (data: {
    candidateName: string;
    linearIssueId: string;
    linearIssueTitle: string;
    preparationDate: string;
    type: 'message' | 'call' | 'call_setup';
  }) => api.post<PreparationItem>('/preparations', data),

  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    recency?: string;
  }) => api.get<PreparationItem[]>('/preparations', { params }),

  update: (id: string, data: {
    candidateName: string;
    linearIssueId: string;
    linearIssueTitle: string;
    preparationDate: string;
    type: 'message' | 'call' | 'call_setup';
    isNewSession?: boolean;
  }) => api.put<PreparationItem>(`/preparations/${id}`, data),

  delete: (id: string) => api.delete(`/preparations/${id}`),

  stats: (candidateName: string) =>
    api.get<{ total: number; lastPreparationDate: string | null; recency: 'fresh' | 'aging' | 'stale' | null }>(
      `/preparations/stats/${encodeURIComponent(candidateName)}`
    ),
};

export const preparationApi = {
  generate: (data: GeneratePreparationDocRequest) =>
    api.post<{ id: string; jobId: string }>('/preparation', data),

  getStatus: (id: string) =>
    api.get<PreparationDocStatus>(`/preparation/${encodeURIComponent(id)}/status`),

  getDoc: (id: string) =>
    api.get<PreparationDoc>(`/preparation/${encodeURIComponent(id)}`),

  update: (id: string, markdown: string) =>
    api.patch<PreparationDoc>(`/preparation/${encodeURIComponent(id)}`, { markdown }),

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

  getIssues: (params?: { search?: string; first?: number }) =>
    api.get<LinearIssueItem[]>('/linear/issues', { params }),
};