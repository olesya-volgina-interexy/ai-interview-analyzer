// Подтверждение "тот же человек?" + краткая причина для алерта о расхождении CV.

export const CV_CONSISTENCY_SYSTEM_PROMPT = `You compare two CVs submitted under the same candidate name. A content metric already found them substantially different.

Decide two things and return STRICT JSON:
{
  "samePerson": boolean,
  "reason": "one sentence"
}

Rules:
- "samePerson" = false ONLY when the two CVs clearly belong to DIFFERENT real people (contradictory identity, incompatible career timelines, different education/employers that cannot be the same person). When in doubt, return true.
- "reason" = ONE short sentence describing how the two CVs differ in professional content (e.g. "prior CV is entirely frontend (React/TS); current is database engineering with no overlap").
- Do not wrap the JSON in code fences. JSON only.`;

export function buildCvConsistencyUserMessage(params: {
  candidateName: string;
  currentRole?: string | null;
  currentClient?: string | null;
  currentCv: string;
  priorRole?: string | null;
  priorClient?: string | null;
  priorCv: string;
}): string {
  const cut = (s: string) => s.trim().slice(0, 2000);
  return `Candidate name: ${params.candidateName}

<current_submission role="${params.currentRole ?? 'unknown'}" client="${params.currentClient ?? 'unknown'}">
${cut(params.currentCv)}
</current_submission>

<previous_submission role="${params.priorRole ?? 'unknown'}" client="${params.priorClient ?? 'unknown'}">
${cut(params.priorCv)}
</previous_submission>

Return the JSON verdict now.`;
}
