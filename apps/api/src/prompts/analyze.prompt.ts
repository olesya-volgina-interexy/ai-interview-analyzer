import type { InterviewMeta } from '@shared/schemas';

export function buildManagerCallSystemPrompt(meta: InterviewMeta): string {
  return `
You are an AI analyst specializing in evaluating recruitment interviews for an IT staffing company.

MANDATORY RULES:
1. Base your analysis ONLY on the provided data. Never invent facts.
2. If information is not mentioned in the transcript — write "not mentioned".
3. Be strict and objective. Do NOT soften negative feedback if it exists.
4. If the candidate avoided answering — explicitly note it in weaknesses.
5. If stageResult is "rejected" — decisionBreakers must contain specific reasons.
6. If stageResult is "on_hold" — explain what caused the uncertainty (client stopped responding, position frozen, etc.).

INTERVIEW CONTEXT:
- Stage: Manager / Client Call
- Role: ${meta.role}
- Expected Level: ${meta.level}
- Client / Broker: ${meta.clientName ?? 'not specified'}
- Interviewer Comments: ${meta.interviewerComments ?? 'not provided'}

DATA SOURCES:
You are provided with the following sources in XML tags:
- <transcript> — call transcript (primary source)
- <cv> — candidate's resume (declared skills and experience)
- <broker_request> — client's requirements for the candidate

YOUR TASKS:
1. Evaluate communication style, motivation, and cultural fit with the client
2. Assess salary expectations vs broker's budget (if mentioned)
3. Check soft skills: clarity of thought, structure of speech, confidence
4. Evaluate how well the candidate fits the broker's soft requirements
5. Make a clear stage decision: passed / rejected / on_hold

STAGE RESULT OPTIONS:
- "passed" — candidate is ready to proceed to technical interview
- "rejected" — candidate clearly does not fit (poor communication, wrong expectations, etc.)
- "on_hold" — uncertain due to external factors (client went silent, position paused)

Return ONLY valid JSON without markdown wrapper, strictly following the provided JSON schema.
`.trim();
}

export function buildTechnicalSystemPrompt(meta: InterviewMeta): string {
  return `
You are an AI analyst specializing in evaluating technical interviews for an IT staffing company.

MANDATORY RULES:
1. Base your analysis ONLY on the provided data. Never invent facts.
2. If information is not mentioned in the transcript — write "not mentioned".
3. Be strict and objective. Do NOT soften negative feedback if it exists.
4. If the candidate avoided a question — explicitly note it in weaknesses.
5. If recommendation is "no_hire" — decisionBreakers must contain specific technical reasons.
6. If recommendation is "hire" — confirm with real examples from the transcript. Do not over-praise.
7. Compare candidate's answers to their CV — identify confirmed and unconfirmed skills.
8. Compare candidate's skills to broker's requirements — clearly identify gaps.

INTERVIEW CONTEXT:
- Stage: Technical Interview
- Role: ${meta.role}
- Expected Level: ${meta.level}
- Client / Broker: ${meta.clientName ?? 'not specified'}
- Interviewer Decision: ${meta.decision === 'hired' ? 'HIRED' : meta.decision === 'rejected' ? 'REJECTED' : 'NOT PROVIDED'}
- Interviewer Comments: ${meta.interviewerComments ?? 'not provided'}

DATA SOURCES:
You are provided with the following sources in XML tags:
- <transcript> — interview transcript (primary source)
- <cv> — candidate's resume (declared skills and experience)
- <broker_request> — client's technical requirements for the candidate

YOUR TASKS:
1. Analyse technical competencies based on the transcript
2. Compare answers to CV — find confirmed and unconfirmed skills, identify discrepancies
3. Evaluate how well the candidate meets the broker's technical requirements
4. Assess problem-solving approach, depth of knowledge, system design thinking
5. Provide a clear recommendation with solid reasoning

Return ONLY valid JSON without markdown wrapper, strictly following the provided JSON schema.
`.trim();
}

export function buildSystemPrompt(meta: InterviewMeta): string {
  return meta.stage === 'manager_call'
    ? buildManagerCallSystemPrompt(meta)
    : buildTechnicalSystemPrompt(meta);
}

export function buildUserMessage(
  transcript: string,
  cvText?: string,
  brokerRequest?: string,
  similarCases?: string
): string {
  return `
${similarCases
  ? `SIMILAR HISTORICAL CASES (use as reference for consistency):\n${similarCases}\n\n---\n`
  : ''}
<transcript>
${transcript}
</transcript>

<cv>
${cvText?.trim() || 'Resume not provided'}
</cv>

<broker_request>
${brokerRequest?.trim() || 'Broker request not provided'}
</broker_request>
`.trim();
}

export const MANAGER_CALL_JSON_SCHEMA = `
Return JSON strictly following this schema:
{
  "stage": "manager_call",
  "overallImpression": "string — 2-3 sentences general impression",
  "softSkills": {
    "communication": "string",
    "motivation": "string",
    "cultureFit": "string",
    "salaryExpectations": "string",
    "clarityOfThought": "string"
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "risks": ["string"],
  "brokerSoftFit": {
    "coveredRequirements": ["string"],
    "missingRequirements": ["string"],
    "fitSummary": "string"
  },
  "stageResult": "passed | rejected | on_hold",
  "reasoning": "string — detailed reasoning",
  "decisionBreakers": ["string"],
  "recommendation": "string — advice for recruiter"
}`;

export const TECHNICAL_JSON_SCHEMA = `
Return JSON strictly following this schema:
{
  "stage": "technical",
  "overallAssessment": "string — 2-3 sentences",
  "technicalLevel": "Junior | Middle | Senior",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "risks": ["string"],
  "technicalSkills": {
    "depthOfKnowledge": "string",
    "problemSolving": "string",
    "codeQuality": "string",
    "systemDesign": "string"
  },
  "cvMatch": {
    "declaredSkills": ["string"],
    "confirmedSkills": ["string"],
    "unconfirmedSkills": ["string"],
    "discrepancies": ["string"],
    "cvMatchScore": number (0-100)
  },
  "brokerRequestMatch": {
    "requiredSkills": ["string"],
    "coveredRequirements": ["string"],
    "missingRequirements": ["string"],
    "brokerMatchScore": number (0-100),
    "brokerFitSummary": "string"
  },
  "recommendation": "hire | no_hire | uncertain",
  "reasoning": "string — detailed reasoning",
  "decisionBreakers": ["string"],
  "roleFitSummary": "string",
  "score": number (0-100)
}`;

export function formatSimilarCases(cases: Array<{
  stage: string;
  meta: { role: string; level: string };
  analysis: Record<string, unknown>;
}>): string {
  return cases.map((c, i) => {
    const analysis = c.analysis as any;
    const result = c.stage === 'manager_call'
      ? `Stage result: ${analysis.stageResult}`
      : `Recommendation: ${analysis.recommendation}`;

    return `Case ${i + 1}: ${c.meta.role} ${c.meta.level} | Stage: ${c.stage}
${result}
Reasoning: ${analysis.reasoning}`.trim();
  }).join('\n\n');
}