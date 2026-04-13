import { z } from 'zod';

export const InterviewStageSchema = z.enum(['manager_call', 'technical']);

export const InterviewMetaSchema = z.object({
  stage: InterviewStageSchema,                   // ← NEW: этап
  role: z.enum(['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile']),
  level: z.enum(['Junior', 'Middle', 'Senior']),
  // decision только для technical этапа
  decision: z.enum(['hired', 'rejected']).optional(),
  clientName: z.string().optional(),
  candidateName: z.string().optional(),
  interviewerComments: z.string().optional(),
  interviewDate: z.string().optional(),
  krisLink: z.string().url().optional(),
  linearIssueId: z.string().optional(),
  cvUrl: z.string().url().optional(),
  brokerRequest: z.string().optional(),
  managerName: z.string().optional(),
});

export const InterviewQuestionsSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string().optional(),
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped']).optional(),
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
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped']).optional(),
  })).optional(),
});

export const CVMatchSchema = z.object({
  declaredSkills: z.array(z.string()),    // ALL skills from CV (complete list)
  confirmedSkills: z.array(z.string()),   // tested AND demonstrated in interview
  unconfirmedSkills: z.array(z.string()), // tested but NOT demonstrated (penalises score)
  discrepancies: z.array(z.string()),
  cvMatchScore: z.number().min(0).max(100), // based only on tested skills
});

export const BrokerRequestMatchSchema = z.object({
  requiredSkills: z.array(z.string()),
  coveredRequirements: z.array(z.string()),
  missingRequirements: z.array(z.string()),                        // tested but NOT demonstrated (penalises score)
  notAssessedRequirements: z.array(z.string()).optional(),         // in broker request but NOT covered in interview (neutral)
  brokerMatchScore: z.number().min(0).max(100),   // based only on tested requirements
  brokerFitSummary: z.string(),
});

export const TechnicalAnalysisSchema = z.object({
  stage: z.literal('technical'),
  overallAssessment: z.string(),
  technicalLevel: z.enum(['Junior', 'Middle', 'Senior', 'uncertain']),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  technicalSkills: z.object({
    depthOfKnowledge: z.string(),                // глубина знаний
    problemSolving: z.string(),                  // решение задач
    codeQuality: z.string(),                     // качество кода (если было)
    systemDesign: z.string(),                    // системное мышление
  }),
  cvMatch: CVMatchSchema,
  brokerRequestMatch: BrokerRequestMatchSchema,
  recommendation: z.enum(['hire', 'no_hire', 'uncertain']),
  reasoning: z.string(),
  decisionBreakers: z.array(z.string()),
  roleFitSummary: z.string(),
  score: z.number().min(0).max(100),
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string().optional(),
    candidateHandled: z.enum(['well', 'partial', 'poor', 'skipped']).optional(),
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


export const CandidateAnalysisSchema = z.discriminatedUnion('stage', [
  ManagerCallAnalysisSchema,
  TechnicalAnalysisSchema,
  FinalResultAnalysisSchema,
]);

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

export type FinalResultAnalysis = z.infer<typeof FinalResultAnalysisSchema>;
export type InterviewStage = z.infer<typeof InterviewStageSchema>;
export type InterviewMeta = z.infer<typeof InterviewMetaSchema>;
export type InterviewQuestions = z.infer<typeof InterviewQuestionsSchema>;
export type ManagerCallAnalysis = z.infer<typeof ManagerCallAnalysisSchema>;
export type TechnicalAnalysis = z.infer<typeof TechnicalAnalysisSchema>;
export type CandidateAnalysis = z.infer<typeof CandidateAnalysisSchema>;
export type CVMatch = z.infer<typeof CVMatchSchema>;
export type BrokerRequestMatch = z.infer<typeof BrokerRequestMatchSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;