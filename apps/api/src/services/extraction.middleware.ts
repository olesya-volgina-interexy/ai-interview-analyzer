import type { InterviewMeta } from '@shared/schemas';

// ─── Step 1 types (what the LLM extracts) ────────────────────────────────────

type AnswerQuality =
  | 'detailed_with_examples'
  | 'correct_but_surface'
  | 'vague_or_generic'
  | 'not_answered'
  | 'n/a_reverse_question';

export interface Step1Question {
  speaker: string;
  timestamp: string;
  quote: string;
  direction: 'interviewer_to_candidate' | 'candidate_to_interviewer';
  topic: string;
  answer_summary: string;
  answer_quality: AnswerQuality;
}

export interface Step1Output {
  questions: Step1Question[];
  candidateSkills: Array<{
    skill: string;
    context: 'self_introduction' | 'answer_to_question' | 'reverse_question' | 'project_narrative';
    quote: string;
    timestamp: string;
  }>;
  interviewerStatements: Array<{
    quote: string;
    timestamp: string;
    topic: string;
  }>;
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
    interpretation: 'positive' | 'negative' | 'neutral';
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
}

// ─── Broker skill keyword map (extend here to add new skills) ────────────────

export const SKILL_KEYWORDS: Record<string, string[]> = {
  // Long-form keywords match as substrings; short acronyms (≤3 chars) require word-boundary — see matchesSkill()
  'SAP WM': ['warehouse', 'wm', 'storage type', 'put away', 'transfer order', 'goods receipt', 'goods issue', 'goods entry', 'goods movement', 'handling unit', 'stock', 'inspection lots', 'picking', 'putaway'],
  'SAP QM': ['quality', 'inspection', 'inspection lot', 'sampling', 'quality notification', 'qm'],
  'SAP PP': ['production', 'shop floor', 'bom', 'bill of materials', 'routing', 'manufacturing', 'pp'],
  'SAP SD': ['sales', 'delivery', 'shipping', 'billing', 'sd', 'outbound'],
  'SAP MM': ['material management', 'purchasing', 'procurement', 'purchase order', 'mm', 'vendor'],
  'SAP LE': ['logistics execution', 'le', 'shipment'],
  'SAP FI': ['finance', 'accounting', 'general ledger', 'accounts payable', 'fi'],
  'AMS / Incident Management': ['incident', 'support', 'ticket', 'change request', 'ams', 'helpdesk'],
  'Scanner-based processes': ['scanner', 'rf', 'mobile', 'barcode', 'scan'],
  'SAP Customizing': ['customizing', 'configuration', 'img', 'spro'],
  'SAP S/4HANA': ['s/4', 's4', 'hana', 'fiori'],
  'AWS': ['aws', 'ec2', 's3', 'lambda', 'cloudwatch', 'eks'],
  'Kubernetes/EKS': ['kubernetes', 'k8s', 'eks', 'container', 'pod'],
  'Cloud Migration': ['migration', 'migrate', 'cloud', 'lift and shift', 'cutover'],
  'Project Management': ['roadmap', 'milestone', 'sprint', 'stakeholder', 'risk management', 'delivery plan'],
};

// ─── Scoring constants (tune here) ───────────────────────────────────────────

const QUALITY_SCORES: Record<AnswerQuality, number> = {
  'detailed_with_examples': 90,
  'correct_but_surface': 65,
  'vague_or_generic': 30,
  'not_answered': 0,
  'n/a_reverse_question': 0,
};

const MODIFIER_CORRECTION = -15;
const MODIFIER_RECAP = -3;
const MODIFIER_VERBOSITY = -2;
const MODIFIER_VERBOSITY_MAX = -6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOFT_TOPIC_KEYWORDS = [
  'personal interests', 'hobbies', 'work dislikes', 'work style',
  'free time', 'energy', 'dislikes', 'likes at work', 'favorite',
];

function isSoftTopic(topic: string): boolean {
  const t = topic.toLowerCase();
  return SOFT_TOPIC_KEYWORDS.some(k => t.includes(k));
}

const NEGATIVE_SENTIMENT_PATTERNS = [
  "it's enough", "okay i see", "ok i see", "that's enough",
  "mainly focused on", "really focused on",
  "my hope was", "hope is also to cover",
  "we have to compare", "i have a feeling",
  "this will be the challenge", "not a good strategy",
  "for the sake of time",
];
const POSITIVE_SENTIMENT_PATTERNS = [
  "exactly", "impressive", "that's right",
  "when you join us", "in your first weeks",
];

function classifySentiment(quote: string): 'positive' | 'negative' | 'neutral' {
  const q = quote.toLowerCase();
  for (const p of NEGATIVE_SENTIMENT_PATTERNS) if (q.includes(p)) return 'negative';
  for (const p of POSITIVE_SENTIMENT_PATTERNS) if (q.includes(p)) return 'positive';
  // "good" alone is too broad — only count isolated "good" as praise
  if (/\bgood\b/.test(q) && !q.includes('not good') && !q.includes("not a good")) return 'positive';
  return 'neutral';
}

// Skills where answer_summary is used as a backup when topic alone doesn't match
const SUMMARY_BACKUP_SKILLS = new Set(['SAP WM', 'AMS / Incident Management']);

function matchesSkill(text: string, skillName: string): boolean {
  const t = text.toLowerCase();
  return (SKILL_KEYWORDS[skillName] ?? []).some(k => {
    // Short acronyms (≤3 chars) must be whole words to avoid "pp" matching "support", "fi" matching "find"
    if (k.length <= 3) return new RegExp(`\\b${k}\\b`).test(t);
    return t.includes(k);
  });
}

function questionMatchesSkill(q: Step1Question, skill: string): boolean {
  if (matchesSkill(q.topic, skill)) return true;
  // Backup scan of answer_summary for skills that are commonly described there
  if (SUMMARY_BACKUP_SKILLS.has(skill)) {
    return matchesSkill(q.answer_summary ?? '', skill);
  }
  return false;
}

function parseRequiredSkills(brokerRequest: string): string[] {
  if (!brokerRequest) return [];
  return Object.keys(SKILL_KEYWORDS).filter(skill => matchesSkill(brokerRequest, skill));
}

function topicsOverlap(topic1: string, topic2: string): boolean {
  const words1 = topic1.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const t2 = topic2.toLowerCase();
  return words1.some(w => t2.includes(w));
}

function mapCandidateHandled(quality: AnswerQuality): 'well' | 'partial' | 'poor' | 'skipped' {
  if (quality === 'detailed_with_examples') return 'well';
  if (quality === 'correct_but_surface') return 'partial';
  if (quality === 'vague_or_generic') return 'poor';
  return 'skipped';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function processExtraction(
  step1: Step1Output,
  _cvText: string | undefined,
  brokerRequest: string | undefined,
  _meta: InterviewMeta,
): ProcessedExtraction {
  const log: string[] = [];

  const questions: Step1Question[] = step1.questions ?? [];
  const candidateSkills = step1.candidateSkills ?? [];
  const interviewerStatements = step1.interviewerStatements ?? [];

  // ── 2a. Classify sentiment (pattern matching, not LLM) ────────────────────
  const classifiedSentiment = interviewerStatements.map(stmt => ({
    signal: stmt.quote,
    interpretation: classifySentiment(stmt.quote),
    topic: stmt.topic,
  }));

  // ── 2b. Pattern detection ─────────────────────────────────────────────────

  const CORRECTION_TRIGGERS = ["that's not right", "no, actually", "that's the problem", "they are not"];
  const CORRECTION_EXCLUDES = ["it's my example", "let me give you", "mainly focused on", "not a good strategy"];

  const corrections = questions.filter(q =>
    q.direction === 'interviewer_to_candidate' &&
    CORRECTION_TRIGGERS.some(t => q.quote.toLowerCase().includes(t)) &&
    !CORRECTION_EXCLUDES.some(e => q.quote.toLowerCase().includes(e)),
  );

  const RECAP_TRIGGERS = ["so what you mean is", "let me recap", "did i understand correctly", "so to summarize"];
  const recaps = questions.filter(q =>
    q.direction === 'interviewer_to_candidate' &&
    RECAP_TRIGGERS.some(t => q.quote.toLowerCase().includes(t)),
  );

  const VERBOSITY_TRIGGERS = [
    "be concise", "keep it brief", "be more concise",
    "keep it time-bound", "we don't have much time so please be quick",
  ];
  const verbosityInstances = questions.filter(q =>
    q.direction === 'interviewer_to_candidate' &&
    VERBOSITY_TRIGGERS.some(t => q.quote.toLowerCase().includes(t)),
  );

  const AI_OVERRELIANCE_TRIGGERS = ["90% of my time", "i rely on", "i would ask my ai agent"];
  const hasAiOverreliance = questions.some(q =>
    AI_OVERRELIANCE_TRIGGERS.some(t => (q.answer_summary ?? '').toLowerCase().includes(t)),
  );

  const teamScalePattern = /\b(\d[\d,]*)\s*(plants?|countries|sites?|locations?|team members?|people|employees?)\b/i;
  const teamScaleMatch = questions
    .filter(q => q.direction === 'interviewer_to_candidate')
    .find(q => teamScalePattern.test(q.answer_summary));

  // ── 2c. Cross-validation: downgrade answer_quality if neg sentiment on same topic ──
  const adjustedQuestions = questions.map((q, i) => {
    if (q.answer_quality === 'detailed_with_examples' && q.direction === 'interviewer_to_candidate') {
      const hasNegSentiment = classifiedSentiment.some(
        s => s.interpretation === 'negative' && topicsOverlap(s.topic, q.topic),
      );
      if (hasNegSentiment) {
        log.push(`Q[${i}] "${q.topic}": downgraded detailed_with_examples → correct_but_surface (neg sentiment)`);
        return { ...q, answer_quality: 'correct_but_surface' as AnswerQuality };
      }
    }
    return q;
  });

  // ── 2d. Question classification ────────────────────────────────────────────
  const interviewerQs = adjustedQuestions.filter(q => q.direction === 'interviewer_to_candidate');
  const candidateQs = adjustedQuestions.filter(q => q.direction === 'candidate_to_interviewer');
  const technicalQs = interviewerQs.filter(q => !isSoftTopic(q.topic));

  const total = adjustedQuestions.length;
  const iRatio = total > 0 ? interviewerQs.length / total : 0;
  const cRatio = total > 0 ? candidateQs.length / total : 0;
  const interviewFormat: 'standard' | 'discovery' | 'mixed' =
    iRatio > 0.6 ? 'standard' : cRatio > 0.4 ? 'discovery' : 'mixed';

  // ── 2e. Topic-to-broker-skill mapping ─────────────────────────────────────
  const requiredSkills = parseRequiredSkills(brokerRequest ?? '');

  const coveredRequirements: string[] = [];
  const missingRequirements: string[] = [];
  const notAssessedRequirements: string[] = [];

  for (const skill of requiredSkills) {
    const mapped = technicalQs.filter(q => questionMatchesSkill(q, skill));
    if (mapped.length === 0) {
      notAssessedRequirements.push(skill);
    } else {
      const best = mapped.reduce((b, q) =>
        QUALITY_SCORES[q.answer_quality] > QUALITY_SCORES[b.answer_quality] ? q : b,
      ).answer_quality;
      if (best === 'detailed_with_examples' || best === 'correct_but_surface') {
        coveredRequirements.push(skill);
      } else {
        missingRequirements.push(skill);
      }
    }
  }

  // ── 2f. Skill classification ───────────────────────────────────────────────
  // Best quality per topic across all technical questions
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

  // ── 2g. Scoring ────────────────────────────────────────────────────────────
  const cvMatchScore =
    (confirmedSkills.length + unconfirmedSkills.length) > 0
      ? Math.round(confirmedSkills.length / (confirmedSkills.length + unconfirmedSkills.length) * 100)
      : 0;

  const brokerMatchScore =
    (coveredRequirements.length + missingRequirements.length) > 0
      ? Math.round(coveredRequirements.length / (coveredRequirements.length + missingRequirements.length) * 100)
      : 0;

  const brokerCoveragePercent =
    requiredSkills.length > 0
      ? Math.round((coveredRequirements.length + missingRequirements.length) / requiredSkills.length * 100)
      : 0;

  const brokerCoverageReliability: 'comprehensive' | 'partial' | 'minimal' =
    brokerCoveragePercent >= 70 ? 'comprehensive' :
    brokerCoveragePercent >= 40 ? 'partial' : 'minimal';

  // brokerProxyScore when nothing was formally covered yet
  let brokerProxyScore: number | undefined;
  if (coveredRequirements.length === 0 && requiredSkills.length > 0) {
    const declaredMatching = requiredSkills.filter(skill =>
      candidateSkills.some(s => matchesSkill(s.skill, skill)),
    );
    brokerProxyScore = Math.round(declaredMatching.length / requiredSkills.length * 100);
  }

  const scoredQs = technicalQs.filter(q => q.answer_quality !== 'n/a_reverse_question');
  let answerQualityScore =
    scoredQs.length > 0
      ? Math.round(scoredQs.reduce((sum, q) => sum + QUALITY_SCORES[q.answer_quality], 0) / scoredQs.length)
      : 0;

  answerQualityScore += corrections.length * MODIFIER_CORRECTION;
  answerQualityScore += recaps.length * MODIFIER_RECAP;
  answerQualityScore += Math.max(verbosityInstances.length * MODIFIER_VERBOSITY, MODIFIER_VERBOSITY_MAX);
  answerQualityScore = Math.max(0, Math.min(100, answerQualityScore));

  const scopeCoverageScore = brokerCoveragePercent;
  const score = Math.round(answerQualityScore * (0.4 + 0.6 * scopeCoverageScore / 100));

  // ── 2h. Technical level ───────────────────────────────────────────────────
  const vagueCount = scoredQs.filter(q =>
    q.answer_quality === 'vague_or_generic' || q.answer_quality === 'not_answered',
  ).length;
  const mostVague = scoredQs.length > 0 && vagueCount / scoredQs.length > 0.6;

  const technicalLevel: 'Junior' | 'Middle' | 'Senior' =
    (mostVague && confirmedSkills.length <= 1) ? 'Junior' :
    (confirmedSkills.length >= 3 && unconfirmedSkills.length <= confirmedSkills.length) ? 'Senior' :
    'Middle';

  // ── 2i. Weaknesses (three sources only) ──────────────────────────────────
  const weaknesses: string[] = [];

  // Source A: surface-level confirmations
  for (const q of technicalQs) {
    if (q.answer_quality === 'correct_but_surface') {
      weaknesses.push(`${q.topic}: correct but surface-level, lacked detailed examples`);
    }
  }

  // Source B: patterns
  if (verbosityInstances.length > 0) {
    weaknesses.push('Verbosity: interviewer asked to be more concise');
  }
  for (const c of corrections) {
    weaknesses.push(`${c.topic}: corrected by interviewer`);
  }
  if (recaps.length > 0) {
    weaknesses.push('Unclear answer structure — interviewer recap needed');
  }

  // Source C: negative sentiment
  for (const s of classifiedSentiment) {
    if (s.interpretation === 'negative') {
      weaknesses.push(`Interviewer concern: "${s.signal}"`);
    }
  }

  // ── 2j. Strengths ─────────────────────────────────────────────────────────
  const strengths: string[] = [];
  for (const q of technicalQs) {
    if (q.answer_quality === 'detailed_with_examples') {
      const hasNegSentiment = classifiedSentiment.some(
        s => s.interpretation === 'negative' && topicsOverlap(s.topic, q.topic),
      );
      if (!hasNegSentiment) {
        strengths.push(`${q.topic}: demonstrated detailed knowledge with concrete examples`);
      }
    }
  }

  // ── Risks ─────────────────────────────────────────────────────────────────
  const risks: string[] = [];
  if (teamScaleMatch) {
    risks.push('Team scale gap: candidate experience may not match role requirements');
  }
  if (hasAiOverreliance) {
    risks.push('Potential AI over-reliance: candidate mentioned AI tools as primary method');
  }

  // ── 2k. Language assessment ───────────────────────────────────────────────
  let languageAssessment: ProcessedExtraction['languageAssessment'] | undefined;
  const hasLangReq = /english|language|fluent|native|proficiency/i.test(brokerRequest ?? '');

  if (hasLangReq) {
    const obs = step1.languageObservation ?? { topFillers: [], grammarPatterns: [], comprehensionIssues: [], nervousnessSignals: [] };
    const totalFillers = obs.topFillers.reduce((sum, f) => sum + (f.count ?? 0), 0);
    const hasGrammar = obs.grammarPatterns.length > 0;

    const verdict: 'meets_requirement' | 'borderline' | 'below_requirement' =
      totalFillers > 25 || (totalFillers > 15 && hasGrammar) ? 'below_requirement' :
      totalFillers > 15 || hasGrammar ? 'borderline' : 'meets_requirement';

    const demonstratedLevel = verdict === 'meets_requirement' ? 'fluent' : 'borderline';

    languageAssessment = {
      requiredLevel: 'Fluent',
      demonstratedLevel,
      verdict,
      evidence: totalFillers > 0
        ? `${totalFillers} filler occurrences detected${hasGrammar ? ', recurring grammar patterns noted' : ''}`
        : 'No significant language issues observed',
    };
  }

  // ── Output questions ──────────────────────────────────────────────────────
  const outputQuestions = adjustedQuestions.map(q => ({
    question: q.quote,
    topic: q.topic,
    candidateHandled: mapCandidateHandled(q.answer_quality),
    isReverseQuestion: q.direction === 'candidate_to_interviewer',
  }));

  // ── Log ───────────────────────────────────────────────────────────────────
  console.log('[middleware] processExtraction', {
    interviewFormat,
    technicalLevel,
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
    changes: log,
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
