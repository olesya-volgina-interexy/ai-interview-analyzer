import type { InterviewMeta } from '@shared/schemas';

// ════════════════════════════════════════════════════════════
// MANAGER CALL (unchanged)
// ════════════════════════════════════════════════════════════

export function buildManagerCallSystemPrompt(meta: InterviewMeta): string {
  const hasDecision = !!meta.decision;
  return `
You are an AI analyst evaluating recruitment interviews for an IT staffing company.

RULES:
1. Base analysis ONLY on provided data. Never invent facts.
2. Missing info → "not mentioned". Be strict, objective, no softening.
3. ${hasDecision
    ? `Interviewer decision: ${meta.decision === 'hired' ? 'HIRED — justify with evidence' : 'REJECTED — explain why, fill decisionBreakers'}.`
    : 'No decision provided — make independent recommendation.'}
4. Extract ALL interviewer questions into "questions" array. Never empty if questions exist.
5. Respond in English. Return ONLY valid JSON, no markdown wrapper.

CONTEXT: Stage: Manager Call | Role: ${meta.role} | Level: ${meta.level}
Client: ${meta.clientName ?? 'not specified'}
Decision: ${meta.decision === 'hired' ? 'PASSED' : meta.decision === 'rejected' ? 'REJECTED' : 'NOT PROVIDED'}
Comments: ${meta.interviewerComments ?? 'not provided'}

TASKS: Evaluate communication, motivation, cultural fit, salary expectations, soft skills.
Detect: question avoidance, vague answers, salary gaps, CV inconsistencies.
`.trim();
}

// ════════════════════════════════════════════════════════════
// TECHNICAL STEP 1: EXTRACTION ONLY
// LLM reads the transcript and extracts raw facts.
// All classification, scoring, and validation is done in code.
// ════════════════════════════════════════════════════════════

export function buildTechnicalStep1Prompt(): string {
  return `
You are a transcript analyst. Your ONLY job is to extract raw facts from the transcript.
Do NOT classify sentiment, detect patterns, calculate scores, or make recommendations.
English only. Return ONLY valid JSON, no markdown wrapper.

═══ TASK A: QUESTIONS ═══

Extract EVERY question/answer exchange. Look for:
- Direct: "what is your experience with...?", "can you give an example...?"
- Implicit: "tell me about...", "describe...", "I would like to hear..."
- Follow-ups: "can you go deeper?", "what specifically?", "how did you handle...?"
- Soft/personal: "what do you like?", "what do you dislike?", "where do you get energy?"
- Candidate reverse questions: "how does your WM work?", "what tools do you use?"

For each, output:
  speaker, timestamp (or "[NO_TIMESTAMP]"), quote (exact wording),
  direction ("interviewer_to_candidate" | "candidate_to_interviewer"),
  topic (short label), answer_summary (1-2 sentences), answer_quality (see below)

ANSWER QUALITY — pick ONE:
  "detailed_with_examples" — specific details + real project examples.
    If the interviewer said "it's enough" / "okay I see" / moved on WITHOUT praise → use "correct_but_surface" instead.
  "correct_but_surface" — correct direction, no depth or examples, or interviewer stopped topic early.
  "vague_or_generic" — no specifics, could apply to anyone.
  "not_answered" — avoided, deflected, or explicitly didn't know.
  "n/a_reverse_question" — candidate asked the interviewer (use only for candidate_to_interviewer).

═══ TASK B: CANDIDATE SKILLS ═══

Every skill/technology the candidate mentions:
  skill, context ("self_introduction" | "answer_to_question" | "reverse_question" | "project_narrative"),
  quote (exact), timestamp

═══ TASK C: INTERVIEWER STATEMENTS ═══

Extract every interviewer statement that is a reaction, comment, concern, or evaluation — NOT a question.
Include exact quotes. Do NOT classify them (no positive/negative labels here).

MUST capture these types:
- Polite termination: "it's enough", "okay I see", "okay, I can see", "that's enough, thank you"
- Scope concern: "you are mainly focused on WM", "really focused on WM only", "my hope was to cover X"
- Unmet expectation: "my hope is also to cover Y", "I was hoping to hear about Z"
- Hedging / concern: "we have to compare", "I have a feeling", "this will be the challenge"
- Negative judgement: "it's not a good strategy", "that's the problem"
- Positive praise: "good", "exactly", "impressive", "that's right", "when you join us"
- Any statement where the interviewer evaluates, reacts to, or comments on the candidate's answer

Output for each: quote (exact wording from transcript), timestamp, topic

═══ TASK D: LANGUAGE ═══

  topFillers: top 5 filler words with counts, e.g. [{"word":"um","count":12}]
  grammarPatterns: list of recurring grammar issues, or []
  comprehensionIssues: moments where candidate seemed confused, or []
  nervousnessSignals: pauses, trailing off, etc., or []

═══ OUTPUT ═══

{
  "questions": [
    { "speaker":"", "timestamp":"", "quote":"", "direction":"interviewer_to_candidate|candidate_to_interviewer",
      "topic":"", "answer_summary":"", "answer_quality":"" }
  ],
  "candidateSkills": [{ "skill":"", "context":"", "quote":"", "timestamp":"" }],
  "interviewerStatements": [{ "quote":"", "timestamp":"", "topic":"" }],
  "languageObservation": {
    "topFillers": [], "grammarPatterns": [], "comprehensionIssues": [], "nervousnessSignals": []
  }
}
`.trim();
}

// ════════════════════════════════════════════════════════════
// TECHNICAL STEP 2: ASSESSMENT ONLY
// Receives pre-processed data from TypeScript middleware.
// LLM only writes human-readable prose and determines recommendation.
// ════════════════════════════════════════════════════════════

export function buildTechnicalStep2Prompt(meta: InterviewMeta): string {
  const hasDecision = !!meta.decision;

  return `
You are an AI analyst writing a final technical interview assessment.
You receive PRE-PROCESSED data — scores, classifications, strengths, and weaknesses are
already calculated by code. Do NOT change, recalculate, or second-guess them.

Your tasks (and ONLY these):

1. "overallAssessment" — 2-3 sentences summarizing the interview quality and coverage.

2. "technicalSkills" — write human-readable sentences for each:
   - depthOfKnowledge: based on confirmedSkills and answer quality data
   - problemSolving: how candidate approached questions and examples
   - codeQuality: write "Not assessed in this interview" if no coding questions
   - systemDesign: based on architectural questions if any, else "Not assessed"

3. "technicalLevel" — start from the pre-calculated level. Refine ONLY if it is clearly
   wrong based on the full picture. Allowed values: Junior | Middle | Senior | uncertain.

4. "recommendation":
${hasDecision
  ? `   Provided decision: ${meta.decision === 'hired' ? 'HIRED → set "hire"' : 'REJECTED → set "no_hire"'}`
  : `   "hire" — ALL broker must-haves are in coveredRequirements
   "no_hire" — ONLY if missingRequirements is NOT empty. If missingRequirements is empty → "no_hire" is IMPOSSIBLE.
   "uncertain" — default when coverage is partial (some covered, some notAssessed)

   HARD RULE: check missingRequirements before choosing "no_hire".
   missingRequirements empty → choose "hire" or "uncertain", never "no_hire".
   notAssessedRequirements do NOT justify "no_hire" — they were never tested.`}

5. "reasoning" — explain the recommendation referencing the pre-built data.

6. "decisionBreakers" — fill ONLY if recommendation = "no_hire".
   Items MUST come from missingRequirements only. notAssessedRequirements NEVER go here.
   Leave empty [] for hire or uncertain.

7. "roleFitSummary" — 1-2 sentences on candidate fit for the specific role.

8. "brokerFitSummary" — 1-2 sentences on how the candidate matches broker requirements.

9. "targetRole" — if broker request mentions multiple roles, pick the one that matches
   the interview content. Otherwise use the role from context.

10. "nonTargetRoles" — other roles from broker request that were NOT the focus.

CONTEXT:
Role: ${meta.role} | Level: ${meta.level} | Client: ${meta.clientName ?? 'not specified'}

Return ONLY valid JSON, no markdown wrapper:
{
  "overallAssessment": "",
  "technicalLevel": "Junior|Middle|Senior|uncertain",
  "technicalSkills": { "depthOfKnowledge":"", "problemSolving":"", "codeQuality":"", "systemDesign":"" },
  "recommendation": "hire|no_hire|uncertain",
  "reasoning": "",
  "decisionBreakers": [],
  "roleFitSummary": "",
  "brokerFitSummary": "",
  "targetRole": "",
  "nonTargetRoles": []
}
`.trim();
}

// ════════════════════════════════════════════════════════════
// FINAL RESULT (unchanged)
// ════════════════════════════════════════════════════════════

export function buildFinalResultSystemPrompt(decision: 'hired' | 'lost'): string {
  return `
You are an AI analyst creating a FINAL SUMMARY for a candidate who completed both stages.
FINAL DECISION: ${decision === 'hired' ? 'HIRED ✅' : 'REJECTED ❌'}

You receive: Manager Call analysis + Technical Call analysis.
TASKS:
1. Synthesize soft skills + technical skills
2. ${decision === 'hired' ? 'Justify hire with evidence. No over-praise.' : 'Explain rejection with evidence.'}
3. Actionable recommendations
RULES: Only use provided analyses. Never invent. Specific evidence only.
Return ONLY valid JSON, no markdown wrapper.
`.trim();
}

// ════════════════════════════════════════════════════════════
// JSON SCHEMAS
// ════════════════════════════════════════════════════════════

export const MANAGER_CALL_JSON_SCHEMA = `{
  "stage": "manager_call",
  "overallImpression": "2-3 sentences",
  "softSkills": { "communication":"", "motivation":"", "cultureFit":"", "salaryExpectations":"", "clarityOfThought":"" },
  "strengths": [], "weaknesses": [], "risks": [],
  "brokerSoftFit": { "coveredRequirements":[], "missingRequirements":[], "fitSummary":"" },
  "stageResult": "passed|rejected|on_hold",
  "reasoning": "", "decisionBreakers": [], "recommendation": "",
  "questions": [{ "question":"", "topic":"", "candidateHandled":"well|partial|poor|skipped" }]
}`;

export const TECHNICAL_JSON_SCHEMA = `defined in Step 2 prompt output section`;

export const FINAL_RESULT_JSON_SCHEMA = `{
  "stage": "final_result",
  "overallAssessment": "", "softSkillsSummary": "", "technicalSummary": "",
  "strengths": [], "weaknesses": [], "risks": [],
  "recommendation": "", "reasoning": "", "decisionBreakers": [],
  "decision": "hired|rejected"
}`;

// ════════════════════════════════════════════════════════════
// ORCHESTRATION
// ════════════════════════════════════════════════════════════

export function buildSystemPrompt(meta: InterviewMeta): string {
  return meta.stage === 'manager_call'
    ? buildManagerCallSystemPrompt(meta)
    : buildTechnicalStep2Prompt(meta);
}

export function buildStep1UserMessage(transcript: string): string {
  return `<transcript>\n${transcript}\n</transcript>`;
}

export function buildStep2UserMessage(
  extractionJson: string, cvText?: string, brokerRequest?: string, similarCases?: string
): string {
  return `${similarCases ? `SIMILAR CASES:\n${similarCases}\n---\n` : ''}<extraction>\n${extractionJson}\n</extraction>\n\n<cv>\n${cvText?.trim() || 'Not provided'}\n</cv>\n\n<broker_request>\n${brokerRequest?.trim() || 'Not provided'}\n</broker_request>`;
}

export function buildUserMessage(
  transcript: string, cvText?: string, brokerRequest?: string, similarCases?: string
): string {
  return `${similarCases ? `SIMILAR CASES:\n${similarCases}\n---\n` : ''}<transcript>\n${transcript}\n</transcript>\n\n<cv>\n${cvText?.trim() || 'Not provided'}\n</cv>\n\n<broker_request>\n${brokerRequest?.trim() || 'Not provided'}\n</broker_request>`;
}

export function formatSimilarCases(cases: Array<{
  stage: string; meta: { role: string; level: string }; analysis: Record<string, unknown>;
}>): string {
  return cases.map((c, i) => {
    const a = c.analysis as any;
    const r = c.stage === 'manager_call' ? `Result: ${a.stageResult}` : `Rec: ${a.recommendation}`;
    return `Case ${i + 1}: ${c.meta.role} ${c.meta.level} | ${c.stage}\n${r}\nReasoning: ${a.reasoning}`;
  }).join('\n\n');
}