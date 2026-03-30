import { z } from 'zod';

export const InterviewMetaSchema = z.object({
  role: z.enum(['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile']),
  level: z.enum(['Junior', 'Middle', 'Senior']),
  decision: z.enum(['hired', 'rejected']),
  clientName: z.string().optional(),
  candidateName: z.string().optional(),
  interviewerComments: z.string().optional(),
  interviewDate: z.string().optional(),
  krisLink: z.string().url().optional(),
  linearIssueId: z.string().optional(),
  cvUrl: z.string().url().optional(),
  brokerRequest: z.string().optional(),
});

export const CVMatchSchema = z.object({
  declaredSkills: z.array(z.string()),
  confirmedSkills: z.array(z.string()),
  unconfirmedSkills: z.array(z.string()),
  discrepancies: z.array(z.string()),
  cvMatchScore: z.number().min(0).max(100),
});

export const BrokerRequestMatchSchema = z.object({
  requiredSkills: z.array(z.string()),
  coveredRequirements: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  brokerMatchScore: z.number().min(0).max(100),
  brokerFitSummary: z.string(),
});

export const CandidateAnalysisSchema = z.object({
  overallAssessment: z.string(),
  technicalLevel: z.enum(['Junior', 'Middle', 'Senior']),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  softSkills: z.object({
    communication: z.string(),
    structureOfAnswers: z.string(),
    behaviorUnderPressure: z.string(),
  }),
  cvMatch: CVMatchSchema,
  brokerRequestMatch: BrokerRequestMatchSchema,
  recommendation: z.enum(['hire', 'no_hire', 'uncertain']),
  reasoning: z.string(),
  decisionBreakers: z.array(z.string()),
  roleFitSummary: z.string(),
  score: z.number().min(0).max(100).optional(),
});

export const AnalyzeRequestSchema = z.object({
  transcript: z.string().min(100),
  meta: InterviewMetaSchema,
  cvText: z.string().optional(),
  brokerRequest: z.string().optional(),
});

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

export type InterviewMeta = z.infer<typeof InterviewMetaSchema>;
export type CVMatch = z.infer<typeof CVMatchSchema>;
export type BrokerRequestMatch = z.infer<typeof BrokerRequestMatchSchema>;
export type CandidateAnalysis = z.infer<typeof CandidateAnalysisSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;