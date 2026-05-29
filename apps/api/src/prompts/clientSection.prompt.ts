import type { ClientInsights } from '@shared/schemas';

// Промпт для генерации ТОЛЬКО секции "Подготовка к вопросам клиента" в
// preparation doc. Скелет всей доки собирается в коде; LLM отвечает только за
// этот один блок — это дешевле и стабильнее.

export const CLIENT_SECTION_SYSTEM_PROMPT = `You are an experienced IT recruiter helping a candidate prepare for an interview with a specific client.

Your task: generate ONE Markdown section titled "## Подготовка к вопросам клиента" — a focused, personalised cheat-sheet of likely interview questions and how to answer them.

Output format (EXACT):

## Подготовка к вопросам клиента

### {Question text}
**Как ответить:** {specific guidance tied to the candidate's CV and to what this client values}

### {Question text}
**Как ответить:** ...

(8–10 questions total, grouped by topic where natural.)

Rules:
1. Output language: Russian. Question text and guidance — both in Russian.
2. Base questions ONLY on the provided client profile (topQuestions list). Group near-duplicates into one representative question. Prioritise by frequency.
3. Make every answer recommendation specific to THIS candidate's CV — reference concrete experience, technologies, projects from the CV.
4. Do NOT mention statistics, "past interviews", "previous candidates", or that you have aggregated data. Write as if you simply know this client well.
5. Do NOT name individual hiring managers.
6. Do NOT add a preamble before "## Подготовка к вопросам клиента". The first line of your response MUST be exactly that heading.
7. Do NOT add any sections beyond this one. Do NOT add footer notes or recommendations after the questions.
8. Do NOT wrap output in code fences. Raw Markdown only.
9. Keep total length under ~600 words. Quality over quantity — drop a weak question rather than padding.`;

export function buildClientSectionUserMessage(params: {
  clientName: string;
  role: string | undefined;
  cvText: string;
  clientProfile: ClientInsights;
}): string {
  const { clientProfile } = params;

  const topQuestionsJson =
    clientProfile.topQuestions.length > 0
      ? JSON.stringify(clientProfile.topQuestions, null, 2)
      : '[]';
  const successPatterns =
    clientProfile.successPatterns.length > 0
      ? clientProfile.successPatterns.join(', ')
      : 'none';
  const failurePatterns =
    clientProfile.failurePatterns.length > 0
      ? clientProfile.failurePatterns.join(', ')
      : 'none';
  const redFlags =
    clientProfile.redFlags.length > 0
      ? clientProfile.redFlags.join(', ')
      : 'none';

  return `
<client>
Name: ${params.clientName}
Role candidate is interviewing for: ${params.role ?? 'not specified'}
</client>

<client_profile>
Summary: ${clientProfile.summary || 'not available'}
Based on: ${clientProfile.basedOnInterviews} interview(s)
Top questions (use these to derive the question list):
${topQuestionsJson}
Success patterns at this client: ${successPatterns}
Failure patterns at this client: ${failurePatterns}
Red flags at this client: ${redFlags}
</client_profile>

<candidate_cv>
${params.cvText.trim() || 'CV not provided'}
</candidate_cv>

Generate the "## Подготовка к вопросам клиента" section now, following the rules from the system prompt.
`.trim();
}
