import { z } from 'zod';

export const InterviewStageSchema = z.enum(['manager_call', 'technical']);

export const InterviewMetaSchema = z.object({
  stage: InterviewStageSchema,
  role: z.string().min(1).max(100),
  level: z.enum(['Junior', 'Middle', 'Senior', 'Architect']),
  // decision только для technical этапа
  decision: z.enum(['hired', 'rejected']).optional(),
  clientName: z.string().optional(),
  candidateName: z.string().optional(),
  interviewerComments: z.string().optional(),
  interviewDate: z.string().optional(),
  krisLink: z.string().url().optional(),
  linearIssueId: z.string().optional(),
  cvUrl: z.string().url().optional(),
  transcriptUrl: z.string().url().optional(),
  brokerRequest: z.string().optional(),
  managerName: z.string().optional(),
});

export const InterviewQuestionsSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string().optional(),
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped', 'guided']).catch('skipped').optional(),
  })),
});

export const ManagerCallAnalysisSchema = z.object({
  stage: z.literal('manager_call'),
  overallImpression: z.string(),                 // общее впечатление от звонка
  softSkills: z.object({
    communication: z.string(),                   // качество коммуникации
    motivation: z.string(),                      // мотивация кандидата
    cultureFit: z.string(),                      // соответствие культуре клиента
    salaryExpectations: z.string(),              // зарплатные ожидания vs запрос
    clarityOfThought: z.string(),                // чёткость мышления и речи
  }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  // Соответствие запросу брокера по soft-критериям
  brokerSoftFit: z.object({
    coveredRequirements: z.array(z.string()),
    missingRequirements: z.array(z.string()),
    fitSummary: z.string(),
  }),
  // Решение после менеджер-колла
  stageResult: z.enum(['passed', 'rejected', 'on_hold']),
  // on_hold = клиент перестал отвечать / позиция заморожена
  reasoning: z.string(),
  decisionBreakers: z.array(z.string()),         // причины если rejected
  recommendation: z.string(),                    // рекомендация рекрутеру
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string().optional(),
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped', 'guided']).catch('skipped').optional(),
  })).optional(),
});

export const CVMatchSchema = z.object({
  declaredSkills: z.array(z.string()),
  confirmedSkills: z.array(z.string()),
  unconfirmedSkills: z.array(z.string()),
  discrepancies: z.array(z.string()),
  cvMatchScore: z.coerce.number().min(0).max(100),
});

export const BrokerRequestMatchSchema = z.object({
  requiredSkills: z.array(z.string()),
  coveredRequirements: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  notAssessedRequirements: z.array(z.string()).optional(),
  brokerMatchScore: z.coerce.number().min(0).max(100),
  brokerFitSummary: z.string(),
  brokerProxyScore: z.coerce.number().min(0).max(100).optional(),
  brokerCoveragePercent: z.coerce.number().min(0).max(100).optional(),
  brokerCoverageReliability: z.enum(['comprehensive', 'partial', 'minimal']).optional(),
});

export const TechnicalAnalysisSchema = z.object({
  stage: z.literal('technical'),
  interviewFormat: z.enum(['standard', 'discovery', 'mixed']).optional(),
  targetRole: z.string().optional(),
  nonTargetRoles: z.array(z.string()).optional(),
  overallAssessment: z.string(),
  technicalLevel: z.enum(['Junior', 'Middle', 'Senior', 'uncertain']),
  languageAssessment: z.object({
    requiredLevel: z.string(),
    demonstratedLevel: z.string(),
    verdict: z.enum(['meets_requirement', 'borderline', 'below_requirement', 'not_assessed']),
    evidence: z.string(),
  }).optional(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  interviewerSentiment: z.array(z.object({
    signal: z.string(),
    interpretation: z.enum(['positive', 'negative', 'neutral']),
    topic: z.string(),
  })).optional(),
  technicalSkills: z.object({
    depthOfKnowledge: z.string(),
    problemSolving: z.string(),
    codeQuality: z.string(),
    systemDesign: z.string(),
  }),
  cvMatch: CVMatchSchema,
  brokerRequestMatch: BrokerRequestMatchSchema,
  recommendation: z.enum(['hire', 'no_hire', 'uncertain']),
  reasoning: z.string(),
  decisionBreakers: z.array(z.string()),
  roleFitSummary: z.string(),
  score: z.coerce.number().min(0).max(100),
  answerQualityScore: z.coerce.number().min(0).max(100).optional(),
  scopeCoverageScore: z.coerce.number().min(0).max(100).optional(),
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string().optional(),
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped', 'guided']).catch('skipped').optional(),
    isReverseQuestion: z.boolean().optional(),
  })).optional(),
});

export const FinalResultAnalysisSchema = z.object({
  stage: z.literal('final_result'),
  overallAssessment: z.string(),
  softSkillsSummary: z.string(),      // сводка из менеджер-колла
  technicalSummary: z.string(),       // сводка из технички
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  recommendation: z.string(),
  reasoning: z.string(),
  decisionBreakers: z.array(z.string()),
  decision: z.enum(['hired', 'rejected']),
});

export const ClientInsightsSchema = z.object({
  summary: z.string(),
  topQuestions: z.array(z.object({
    question: z.string(),
    topic: z.string(),
    frequency: z.number().int().min(0),
    avgHandled: z.enum(['well', 'partial', 'poor']).nullable(),
  })),
  successPatterns: z.array(z.string()),
  failurePatterns: z.array(z.string()),
  redFlags: z.array(z.string()),
  managerStyles: z.array(z.object({
    managerName: z.string(),
    interviewCount: z.number().int().min(0),
    avgScore: z.number().nullable(),
  })),
  basedOnInterviews: z.number().int().min(0),
  generatedAt: z.string(),
});

export const PreparationDocStatusSchema = z.enum(['pending', 'completed', 'failed']);

export const PreparationDocSchema = z.object({
  id: z.string().uuid(),
  candidateName: z.string(),
  clientName: z.string(),
  brokerRequest: z.string().nullable(),
  markdown: z.string(),
  sourceInterviewIds: z.array(z.string()),
  status: PreparationDocStatusSchema,
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CandidateAnalysisSchema = z.discriminatedUnion('stage', [
  ManagerCallAnalysisSchema,
  TechnicalAnalysisSchema,
  FinalResultAnalysisSchema,
]);

export const AnalyzeRequestSchema = z.object({
  transcript: z.string().optional(),
  meta: InterviewMetaSchema,
  cvText: z.string().optional(),
  brokerRequest: z.string().optional(),
}).refine(
  data => (data.transcript && data.transcript.length >= 100) || !!data.meta.transcriptUrl,
  {
    message: 'Provide either transcript text (min 100 characters) or a transcript URL',
    path: ['transcript'],
  }
);

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const ChatRequestSchema = z.object({
  message: z.string(),
  clientName: z.string().optional(),
  candidateId: z.string().optional(),
  history: z.array(ChatMessageSchema),
});

export const GeneratePreparationDocRequestSchema = z.object({
  candidateName: z.string().min(1),
  clientName: z.string().min(1),
  candidateId: z.string().uuid().optional(),
  cvText: z.string().optional(),
  cvUrl: z.string().url().optional(),
  role: z.string().optional(),
  linearIssueId: z.string().optional(),
  brokerRequest: z.string().optional(),
});

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.string(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: AuthUserSchema,
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export type FinalResultAnalysis = z.infer<typeof FinalResultAnalysisSchema>;
export type InterviewStage = z.infer<typeof InterviewStageSchema>;
export type InterviewMeta = z.infer<typeof InterviewMetaSchema>;
export type InterviewQuestions = z.infer<typeof InterviewQuestionsSchema>;
export type ManagerCallAnalysis = z.infer<typeof ManagerCallAnalysisSchema>;
export type TechnicalAnalysis = z.infer<typeof TechnicalAnalysisSchema>;
export type CandidateAnalysis = z.infer<typeof CandidateAnalysisSchema>;
export type ClientInsights = z.infer<typeof ClientInsightsSchema>;
export type CVMatch = z.infer<typeof CVMatchSchema>;
export type BrokerRequestMatch = z.infer<typeof BrokerRequestMatchSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type PreparationDocStatus = z.infer<typeof PreparationDocStatusSchema>;
export type PreparationDoc = z.infer<typeof PreparationDocSchema>;
export type GeneratePreparationDocRequest = z.infer<typeof GeneratePreparationDocRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
