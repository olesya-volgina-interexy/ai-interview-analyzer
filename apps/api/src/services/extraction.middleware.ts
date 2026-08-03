import type { InterviewMeta } from '@shared/schemas';
import type { TruncationResult } from '../utils/transcriptUtils';

// ─── Step 1 types (what the LLM extracts) ────────────────────────────────────
// Step 1 LLM now performs domain-specific judgment: broker requirement parsing,
// question-to-requirement mapping, sentiment classification, signal detection.
// Middleware below is intentionally domain-agnostic.

type AnswerQuality =
  | 'detailed_with_examples'
  | 'correct_but_surface'
  | 'vague_or_generic'
  | 'not_answered'
  | 'n/a_reverse_question';

type SentimentInterpretation = 'positive' | 'negative' | 'neutral';

export interface Step1Requirement {
  id: string;
  skill: string;
  priority: 'must_have' | 'nice_to_have';
}

export interface Step1Question {
  speaker: string;
  timestamp: string;
  quote: string;
  direction: 'interviewer_to_candidate' | 'candidate_to_interviewer';
  topic: string;
  answer_summary: string;
  answer_quality: AnswerQuality;
  coversRequirements?: string[];
}

export interface Step1InterviewerStatement {
  quote: string;
  timestamp: string;
  topic: string;
  interpretation: SentimentInterpretation;
  reason?: string;
}

export interface Step1Signals {
  corrections?: Array<{ topic: string; quote: string }>;
  recapChecks?: Array<{ topic: string; quote: string }>;
  verbosityRequests?: Array<{ quote: string }>;
  scaleConcerns?: Array<{ quote: string; reason?: string }>;
}

export interface Step1RedFlag {
  type: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high';
}

export interface Step1Output {
  // Заполняется LLM, только если транскрипт в принципе непригоден для анализа
  // (не тот тип звонка, нет реального разговора и т.п.) — не для слабого/короткого
  // интервью. Проверяется вызывающей стороной (llm.service.ts) до запуска
  // processExtraction/Step 2.
  dataQualityIssue?: { type: string; explanation: string } | null;
  parsedBrokerRequirements?: Step1Requirement[];
  questions: Step1Question[];
  candidateSkills: Array<{
    skill: string;
    context: 'self_introduction' | 'answer_to_question' | 'reverse_question' | 'project_narrative';
    quote: string;
    timestamp: string;
  }>;
  interviewerStatements: Step1InterviewerStatement[];
  interviewerSignals?: Step1Signals;
  candidateRedFlags?: Step1RedFlag[];
  languageObservation: {
    topFillers: Array<{ word: string; count: number }>;
    grammarPatterns: string[];
    comprehensionIssues: string[];
    nervousnessSignals: string[];
  };
}

// ─── Processed output (what middleware produces for Step 2) ──────────────────

export interface ProcessedExtraction {
  cvMatchScore: number;
  brokerMatchScore: number;
  brokerCoveragePercent: number;
  brokerCoverageReliability: 'comprehensive' | 'partial' | 'minimal';
  brokerProxyScore?: number;
  answerQualityScore: number;
  scopeCoverageScore: number;
  score: number;

  confirmedSkills: string[];
  unconfirmedSkills: string[];
  declaredSkills: string[];
  coveredRequirements: string[];
  missingRequirements: string[];
  notAssessedRequirements: string[];
  requiredSkills: string[];
  discrepancies: string[];

  strengths: string[];
  weaknesses: string[];
  risks: string[];

  interviewerSentiment: Array<{
    signal: string;
    interpretation: SentimentInterpretation;
    topic: string;
  }>;

  interviewFormat: 'standard' | 'discovery' | 'mixed';
  technicalLevel: 'Junior' | 'Middle' | 'Senior';

  languageAssessment?: {
    requiredLevel: string;
    demonstratedLevel: string;
    verdict: 'meets_requirement' | 'borderline' | 'below_requirement' | 'not_assessed';
    evidence: string;
  };

  questions: Array<{
    question: string;
    topic: string;
    candidateHandled: 'well' | 'partial' | 'poor' | 'skipped' | 'guided';
    isReverseQuestion: boolean;
  }>;

  languageObservation: Step1Output['languageObservation'];

  // Filled by the caller (llm.service) when the transcript exceeded token
  // limits and had to be truncated before Step 1 extraction. When present,
  // buildStep2Input surfaces it so the LLM mentions the gap in overallAssessment.
  truncation?: TruncationResult;
}

// ─── Scoring constants (universal, no domain knowledge) ──────────────────────

const QUALITY_SCORES: Record<AnswerQuality, number> = {
  'detailed_with_examples': 90,
  'correct_but_surface': 65,
  'vague_or_generic': 30,
  'not_answered': 0,
  'n/a_reverse_question': 0,
};

const ANSWER_QUALITY_VALUES = new Set<string>(Object.keys(QUALITY_SCORES));

// Вывод step 1 не валидируется схемой, а рядом в том же JSON лежит шкала
// interpretation (positive/negative/neutral) — модель их путает и присылает
// answer_quality: "neutral". Такое значение давало QUALITY_SCORES[...] ===
// undefined, дальше NaN в answerQualityScore и score, и Zod ронял анализ
// целиком с "Failed to parse LLM response". Запись с нераспознанным качеством
// исключаем из подсчётов, а не приравниваем к плохому ответу — иначе сбой
// формата занижал бы балл кандидату.
function hasKnownAnswerQuality(q: Step1Question): boolean {
  if (ANSWER_QUALITY_VALUES.has(q.answer_quality)) return true;
  console.warn('[middleware] dropping question with unknown answer_quality', {
    answer_quality: q.answer_quality,
    topic: q.topic,
    timestamp: q.timestamp,
  });
  return false;
}

const MODIFIER_CORRECTION = -15;
const MODIFIER_RECAP = -3;
const MODIFIER_VERBOSITY = -2;
const MODIFIER_VERBOSITY_MAX = -6;

// Universal "soft topic" detection — used only to exclude personal questions
// from the technical-quality average. Generic enough to work across domains.
const SOFT_TOPIC_KEYWORDS = [
  'personal interests', 'hobbies', 'work dislikes', 'work style',
  'free time', 'energy', 'dislikes', 'likes at work', 'favorite',
  'motivation', 'values', 'culture',
];

// Балл уходит в Zod-схему как number — NaN/Infinity здесь означает падение
// всего анализа, поэтому страхуемся на выходе, а не только на входе.
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function isSoftTopic(topic: string): boolean {
  const t = (topic ?? '').toLowerCase();
  return SOFT_TOPIC_KEYWORDS.some(k => t.includes(k));
}

function mapCandidateHandled(quality: AnswerQuality): 'well' | 'partial' | 'poor' | 'skipped' {
  if (quality === 'detailed_with_examples') return 'well';
  if (quality === 'correct_but_surface') return 'partial';
  if (quality === 'vague_or_generic') return 'poor';
  return 'skipped';
}

// Convert generic red-flag type into a human-readable risk line.
function redFlagToRisk(flag: Step1RedFlag): string {
  const typeLabel = flag.type.replace(/_/g, ' ');
  const sevTag = flag.severity === 'high' ? '[HIGH] ' : flag.severity === 'medium' ? '[MED] ' : '';
  return `${sevTag}${typeLabel}: ${flag.evidence}`.trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function processExtraction(
  step1: Step1Output,
  _cvText: string | undefined,
  brokerRequest: string | undefined,
  _meta: InterviewMeta,
): ProcessedExtraction {
  const parsedRequirements = step1.parsedBrokerRequirements ?? [];
  const questions: Step1Question[] = (step1.questions ?? []).filter(hasKnownAnswerQuality);
  const candidateSkills = step1.candidateSkills ?? [];
  const interviewerStatements = step1.interviewerStatements ?? [];
  const signals: Step1Signals = step1.interviewerSignals ?? {};
  const redFlags = step1.candidateRedFlags ?? [];

  // ── 1. Sentiment is already classified by LLM — just pass through ─────────
  const classifiedSentiment = interviewerStatements.map(stmt => ({
    signal: stmt.quote,
    interpretation: stmt.interpretation ?? 'neutral',
    topic: stmt.topic ?? '',
  }));

  // ── 2. Signals (already detected semantically by LLM) ──────────────────────
  const corrections = signals.corrections ?? [];
  const recaps = signals.recapChecks ?? [];
  const verbosityInstances = signals.verbosityRequests ?? [];
  const scaleConcerns = signals.scaleConcerns ?? [];

  // ── 3. Question classification ─────────────────────────────────────────────
  const interviewerQs = questions.filter(q => q.direction === 'interviewer_to_candidate');
  const candidateQs = questions.filter(q => q.direction === 'candidate_to_interviewer');
  const technicalQs = interviewerQs.filter(q => !isSoftTopic(q.topic));

  const total = questions.length;
  const iRatio = total > 0 ? interviewerQs.length / total : 0;
  const cRatio = total > 0 ? candidateQs.length / total : 0;
  const interviewFormat: 'standard' | 'discovery' | 'mixed' =
    iRatio > 0.6 ? 'standard' : cRatio > 0.4 ? 'discovery' : 'mixed';

  // ── 4. Broker requirement coverage (via LLM-assigned coversRequirements) ──
  // Build map of req-id → best answer quality observed across all questions that tested it.
  const requirementBestQuality: Record<string, AnswerQuality> = {};
  for (const q of technicalQs) {
    const covered = q.coversRequirements ?? [];
    for (const reqId of covered) {
      const existing = requirementBestQuality[reqId];
      if (!existing || QUALITY_SCORES[q.answer_quality] > QUALITY_SCORES[existing]) {
        requirementBestQuality[reqId] = q.answer_quality;
      }
    }
  }

  const coveredRequirements: string[] = [];
  const missingRequirements: string[] = [];
  const notAssessedRequirements: string[] = [];

  for (const req of parsedRequirements) {
    const quality = requirementBestQuality[req.id];
    if (!quality) {
      notAssessedRequirements.push(req.skill);
    } else if (quality === 'detailed_with_examples' || quality === 'correct_but_surface') {
      coveredRequirements.push(req.skill);
    } else {
      missingRequirements.push(req.skill);
    }
  }

  const requiredSkills = parsedRequirements.map(r => r.skill);

  // ── 5. Skill classification (from question topics, no dictionary) ─────────
  // Group by topic, take best quality per topic — works for any domain.
  const topicBest: Record<string, AnswerQuality> = {};
  for (const q of technicalQs) {
    const existing = topicBest[q.topic];
    if (!existing || QUALITY_SCORES[q.answer_quality] > QUALITY_SCORES[existing]) {
      topicBest[q.topic] = q.answer_quality;
    }
  }

  const confirmedSkills: string[] = [];
  const unconfirmedSkills: string[] = [];
  for (const [topic, quality] of Object.entries(topicBest)) {
    if (quality === 'detailed_with_examples' || quality === 'correct_but_surface') {
      confirmedSkills.push(topic);
    } else if (quality === 'vague_or_generic' || quality === 'not_answered') {
      unconfirmedSkills.push(topic);
    }
  }

  const declaredSkills = candidateSkills
    .filter(s => ['self_introduction', 'project_narrative', 'reverse_question'].includes(s.context))
    .map(s => s.skill)
    .filter(s => !confirmedSkills.includes(s) && !unconfirmedSkills.includes(s));

  // ── 6. Scoring ─────────────────────────────────────────────────────────────
  const cvMatchScore =
    (confirmedSkills.length + unconfirmedSkills.length) > 0
      ? Math.round(confirmedSkills.length / (confirmedSkills.length + unconfirmedSkills.length) * 100)
      : 0;

  const brokerMatchScore =
    (coveredRequirements.length + missingRequirements.length) > 0
      ? Math.round(coveredRequirements.length / (coveredRequirements.length + missingRequirements.length) * 100)
      : 0;

  const brokerCoveragePercent =
    parsedRequirements.length > 0
      ? Math.round((coveredRequirements.length + missingRequirements.length) / parsedRequirements.length * 100)
      : 0;

  const brokerCoverageReliability: 'comprehensive' | 'partial' | 'minimal' =
    brokerCoveragePercent >= 70 ? 'comprehensive' :
    brokerCoveragePercent >= 40 ? 'partial' : 'minimal';

  // brokerProxyScore: fallback for when nothing was formally covered.
  // Compare candidate's declared/mentioned skills against required skills via
  // case-insensitive substring overlap (domain-agnostic; no keyword dictionary).
  let brokerProxyScore: number | undefined;
  if (coveredRequirements.length === 0 && parsedRequirements.length > 0) {
    const declaredMatching = parsedRequirements.filter(req => {
      const needle = req.skill.toLowerCase();
      return candidateSkills.some(s => {
        const hay = s.skill.toLowerCase();
        return hay.includes(needle) || needle.includes(hay);
      });
    });
    brokerProxyScore = Math.round(declaredMatching.length / parsedRequirements.length * 100);
  }

  const scoredQs = technicalQs.filter(q => q.answer_quality !== 'n/a_reverse_question');
  let answerQualityScore =
    scoredQs.length > 0
      ? Math.round(scoredQs.reduce((sum, q) => sum + QUALITY_SCORES[q.answer_quality], 0) / scoredQs.length)
      : 0;

  answerQualityScore += corrections.length * MODIFIER_CORRECTION;
  answerQualityScore += recaps.length * MODIFIER_RECAP;
  answerQualityScore += Math.max(verbosityInstances.length * MODIFIER_VERBOSITY, MODIFIER_VERBOSITY_MAX);
  answerQualityScore = clampScore(answerQualityScore);

  const scopeCoverageScore = brokerCoveragePercent;

  // Score formula:
  //   - With broker requirements: weighted blend of answer quality × scope coverage.
  //   - Without requirements (or broker_request absent): score = answerQualityScore,
  //     because there is no scope to discount against.
  const score = clampScore(
    parsedRequirements.length === 0
      ? answerQualityScore
      : Math.round(answerQualityScore * (0.4 + 0.6 * scopeCoverageScore / 100)),
  );

  // ── 7. Technical level ────────────────────────────────────────────────────
  const vagueCount = scoredQs.filter(q =>
    q.answer_quality === 'vague_or_generic' || q.answer_quality === 'not_answered',
  ).length;
  const mostVague = scoredQs.length > 0 && vagueCount / scoredQs.length > 0.6;

  const technicalLevel: 'Junior' | 'Middle' | 'Senior' =
    (mostVague && confirmedSkills.length <= 1) ? 'Junior' :
    (confirmedSkills.length >= 3 && unconfirmedSkills.length <= confirmedSkills.length) ? 'Senior' :
    'Middle';

  // ── 8. Weaknesses (built from structured LLM signals) ──────────────────────
  const weaknesses: string[] = [];

  // Source A: surface-level confirmations
  for (const q of technicalQs) {
    if (q.answer_quality === 'correct_but_surface') {
      weaknesses.push(`${q.topic}: correct but surface-level, lacked detailed examples`);
    }
  }

  // Source B: behavioral signals (semantic, from LLM)
  if (verbosityInstances.length > 0) {
    weaknesses.push('Verbosity: interviewer asked to be more concise');
  }
  for (const c of corrections) {
    const topic = c.topic ?? 'unspecified topic';
    weaknesses.push(`${topic}: corrected by interviewer`);
  }
  if (recaps.length > 0) {
    weaknesses.push('Unclear answer structure — interviewer recap needed');
  }

  // Source C: negative sentiment from interviewer (semantic classification)
  for (const s of classifiedSentiment) {
    if (s.interpretation === 'negative') {
      weaknesses.push(`Interviewer concern: "${s.signal}"`);
    }
  }

  // ── 9. Strengths ──────────────────────────────────────────────────────────
  // Trust the LLM's sentiment-aware answer_quality (no cross-validation needed —
  // the LLM already downgrades detailed answers when interviewer reacted negatively).
  const strengths: string[] = [];
  for (const q of technicalQs) {
    if (q.answer_quality === 'detailed_with_examples') {
      strengths.push(`${q.topic}: demonstrated detailed knowledge with concrete examples`);
    }
  }

  // ── 10. Risks (from LLM-detected red flags + scale concerns) ──────────────
  const risks: string[] = [];
  for (const sc of scaleConcerns) {
    const reason = sc.reason ?? 'candidate experience scale may not match role requirements';
    risks.push(`Scale concern: ${reason}`);
  }
  for (const flag of redFlags) {
    risks.push(redFlagToRisk(flag));
  }

  // ── 11. Language assessment ───────────────────────────────────────────────
  let languageAssessment: ProcessedExtraction['languageAssessment'] | undefined;
  const hasLangReq = /english|language|fluent|native|proficiency/i.test(brokerRequest ?? '');

  if (hasLangReq) {
    const obs = step1.languageObservation ?? { topFillers: [], grammarPatterns: [], comprehensionIssues: [], nervousnessSignals: [] };
    const totalFillers = obs.topFillers.reduce((sum, f) => sum + (f.count ?? 0), 0);
    const grammarCount = obs.grammarPatterns.length;
    const comprehensionCount = obs.comprehensionIssues.length;

    // Unintelligible speech (comprehensionIssues) is the strongest signal —
    // even a single garbled sentence puts the candidate below "fluent".
    const verdict: 'meets_requirement' | 'borderline' | 'below_requirement' =
      comprehensionCount >= 3 || totalFillers > 25 || (totalFillers > 15 && grammarCount > 0)
        ? 'below_requirement' :
      comprehensionCount >= 1 || totalFillers > 15 || grammarCount > 0
        ? 'borderline' :
        'meets_requirement';

    const demonstratedLevel =
      verdict === 'meets_requirement' ? 'fluent' :
      verdict === 'borderline' ? 'borderline' : 'below fluent';

    const evidenceParts: string[] = [];
    if (comprehensionCount > 0) evidenceParts.push(`${comprehensionCount} comprehension/intelligibility issue${comprehensionCount > 1 ? 's' : ''}`);
    if (totalFillers > 0) evidenceParts.push(`${totalFillers} filler occurrences`);
    if (grammarCount > 0) evidenceParts.push(`${grammarCount} recurring grammar pattern${grammarCount > 1 ? 's' : ''}`);

    languageAssessment = {
      requiredLevel: 'Fluent',
      demonstratedLevel,
      verdict,
      evidence: evidenceParts.length > 0
        ? evidenceParts.join(', ')
        : 'No significant language issues observed',
    };
  }

  // ── Output questions ──────────────────────────────────────────────────────
  const outputQuestions = questions.map(q => ({
    question: q.quote,
    topic: q.topic,
    candidateHandled: mapCandidateHandled(q.answer_quality),
    isReverseQuestion: q.direction === 'candidate_to_interviewer',
  }));

  // ── Log ───────────────────────────────────────────────────────────────────
  console.log('[middleware] processExtraction', {
    interviewFormat,
    technicalLevel,
    parsedRequirements: parsedRequirements.length,
    confirmedSkills: confirmedSkills.length,
    unconfirmedSkills: unconfirmedSkills.length,
    coveredRequirements,
    missingRequirements,
    notAssessedRequirements,
    score,
    answerQualityScore,
    scopeCoverageScore,
    strengths: strengths.length,
    weaknesses: weaknesses.length,
    risks: risks.length,
  });

  return {
    cvMatchScore,
    brokerMatchScore,
    brokerCoveragePercent,
    brokerCoverageReliability,
    brokerProxyScore,
    answerQualityScore,
    scopeCoverageScore,
    score,
    confirmedSkills,
    unconfirmedSkills,
    declaredSkills,
    coveredRequirements,
    missingRequirements,
    notAssessedRequirements,
    requiredSkills,
    discrepancies: [],
    strengths,
    weaknesses,
    risks,
    interviewerSentiment: classifiedSentiment,
    interviewFormat,
    technicalLevel,
    languageAssessment,
    questions: outputQuestions,
    languageObservation: step1.languageObservation,
  };
}

// ─── Format processed data for Step 2 LLM ────────────────────────────────────

export function buildStep2Input(processed: ProcessedExtraction, brokerRequest?: string): string {
  const lines: string[] = [];

  if (processed.truncation?.wasTruncated) {
    const t = processed.truncation;
    lines.push('=== TRANSCRIPT TRUNCATION (MUST mention in overallAssessment) ===');
    lines.push(`Original transcript: ${t.originalChars.toLocaleString()} chars`);
    lines.push(`Analysed: ${t.finalChars.toLocaleString()} chars (head + tail only)`);
    lines.push(`Dropped: ${t.droppedChars.toLocaleString()} chars (~${t.droppedPercent}% of middle section)`);
    lines.push('');
  }

  lines.push('=== CLASSIFICATION RESULTS (pre-calculated by code — do NOT change) ===');
  lines.push(`Confirmed skills: ${processed.confirmedSkills.join(', ') || 'none'}`);
  lines.push(`Unconfirmed skills: ${processed.unconfirmedSkills.join(', ') || 'none'}`);
  lines.push(`Declared (from CV/intro, not tested): ${processed.declaredSkills.join(', ') || 'none'}`);
  lines.push('');
  lines.push(`Broker requirements COVERED: ${processed.coveredRequirements.join(', ') || 'none'}`);
  lines.push(`Broker requirements MISSING: ${processed.missingRequirements.join(', ') || 'none'}`);
  lines.push(`Broker requirements NOT ASSESSED: ${processed.notAssessedRequirements.join(', ') || 'none'}`);

  lines.push('');
  lines.push('=== SCORES (pre-calculated — do NOT recalculate) ===');
  lines.push(`Overall score: ${processed.score}/100`);
  lines.push(`Answer quality score: ${processed.answerQualityScore}/100`);
  lines.push(`Scope coverage score: ${processed.scopeCoverageScore}/100`);
  lines.push(`CV match score: ${processed.cvMatchScore}/100`);
  lines.push(`Broker match score: ${processed.brokerMatchScore}/100`);
  lines.push(`Broker coverage: ${processed.brokerCoveragePercent}% (${processed.brokerCoverageReliability})`);

  lines.push('');
  lines.push('=== STRENGTHS (pre-built — do NOT add/remove) ===');
  if (processed.strengths.length > 0) {
    processed.strengths.forEach(s => lines.push(`- ${s}`));
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('=== WEAKNESSES (pre-built — do NOT add/remove) ===');
  if (processed.weaknesses.length > 0) {
    processed.weaknesses.forEach(w => lines.push(`- ${w}`));
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('=== RISKS ===');
  if (processed.risks.length > 0) {
    processed.risks.forEach(r => lines.push(`- ${r}`));
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('=== INTERVIEWER SENTIMENT ===');
  if (processed.interviewerSentiment.length > 0) {
    processed.interviewerSentiment.forEach(s =>
      lines.push(`- [${s.interpretation.toUpperCase()}] "${s.signal}" — topic: ${s.topic}`),
    );
  } else {
    lines.push('- none detected');
  }

  if (processed.languageAssessment) {
    lines.push('');
    lines.push('=== LANGUAGE ASSESSMENT (pre-calculated) ===');
    lines.push(`Verdict: ${processed.languageAssessment.verdict}`);
    lines.push(`Evidence: ${processed.languageAssessment.evidence}`);
  }

  if (brokerRequest) {
    lines.push('');
    lines.push('=== BROKER REQUEST ===');
    lines.push(brokerRequest.trim());
  }

  return lines.join('\n');
}
