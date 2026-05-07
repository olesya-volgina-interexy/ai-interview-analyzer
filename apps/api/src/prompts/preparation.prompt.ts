import type { ClientInsights } from '@shared/schemas';

export function buildPreparationDocSystemPrompt(params: {
  clientName: string;
  managerStyles: Array<{ managerName: string; style?: string }>;
  technicalFocus: string[];
  softSkillsFocus: string[];
}): string {
  const managers =
    params.managerStyles.length > 0
      ? params.managerStyles
          .map((m) => (m.style ? `${m.managerName} (${m.style})` : m.managerName))
          .join(', ')
      : 'not specified';

  const techFocus =
    params.technicalFocus.length > 0
      ? params.technicalFocus.join(', ')
      : 'not specified';

  const softFocus =
    params.softSkillsFocus.length > 0
      ? params.softSkillsFocus.join(', ')
      : 'not specified';

  return `
You are an experienced IT recruiter and career consultant.
Your task is to prepare a candidate for an upcoming interview with a specific client by writing a personalised preparation document.

════════════════════════════════════════
CLIENT CONTEXT
════════════════════════════════════════

- Client: ${params.clientName}
- Hiring managers (style hints): ${managers}
- Technical focus areas at this client: ${techFocus}
- Soft skills focus areas at this client: ${softFocus}

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════

Generate a Markdown document with EXACTLY these six sections, in this order, using these exact level-2 headings:

## About the Client
A short description of the company/team and what they are looking for in candidates.
Use the client profile data to personalise — do NOT write generic corporate boilerplate.

## Likely Questions and How to Answer
Top 8–10 likely questions based on interview history at this client.
For each question use this exact sub-format:

### {Question text}
**How to answer:** {specific guidance referencing the candidate's CV and concrete experience}

Group near-duplicates into a single representative question. Prioritise by frequency.

## Technical Focus
Which technical topics deserve attention before the interview.
What to refresh, review, or practice — based on what this client typically tests AND on the gap between the candidate's CV and the role.

## Soft Skills and Communication
What hiring managers at this client pay attention to during interviews.
How the candidate should behave: tone, structure of answers, how to handle uncertainty, how to present trade-offs.

## What to Avoid
Red flags and common mistakes that caused other candidates to fail interviews with this client.
Be concrete — name the behaviours, not generic interview anti-patterns.

## Preparation Recommendations
A concrete, ordered checklist of preparation steps personalised to this candidate:
what to read, what to practise, what to rehearse, what gaps to close.
Each item must be actionable and tied to either a CV gap or a known client expectation.

════════════════════════════════════════
WRITING RULES
════════════════════════════════════════

1. ALWAYS respond in English regardless of the language of the CV or broker request.
2. Be specific. No abstract advice ("improve your communication"). Tie every recommendation to either:
   (a) a real client expectation from the client profile, or
   (b) a concrete fact from the candidate's CV.
3. Do NOT mention that you have data about past interviews, statistics, profile aggregates, or other candidates.
   Write as if you simply know this client well from professional experience.
   Never write phrases like "based on past interviews", "according to the data", "previous candidates".
4. Do NOT invent facts. If a section has insufficient data, keep it short and honest
   ("Limited information about this client's process — focus on the role basics") rather than padding with generic filler.
5. Do NOT name individual hiring managers in the body of the document.
   Manager style hints inform tone and emphasis but must not surface as "Manager X likes Y".
6. Do NOT start the document with a preamble, greeting, or meta-comment.
   The first line of the response MUST be exactly: ## About the Client
7. Do NOT wrap the response in code fences (\`\`\`), HTML, JSON, or any other wrapper.
   Return raw Markdown only.
8. Use bullet lists where appropriate, but do not over-bullet — paragraphs are acceptable.
9. Keep the whole document under ~1200 words. Quality and specificity over length.

════════════════════════════════════════
CONSISTENCY CHECK (run before output)
════════════════════════════════════════

Before finalising, verify:
[ ] All six sections are present in the correct order with the exact headings.
[ ] No mention of "data", "statistics", "past interviews", or other candidates.
[ ] No individual manager names appear outside the implicit "Soft Skills" guidance.
[ ] Every recommendation in "Preparation Recommendations" is tied to a CV fact OR a client expectation, not generic advice.
[ ] "What to Avoid" reflects this client's actual failure patterns, not universal interview tips.
[ ] Each likely question uses the "### Question / **How to answer:**" sub-format.
[ ] No code fences or wrapper around the Markdown output.

If any check fails — revise before output.
`.trim();
}

export function buildPreparationDocUserMessage(params: {
  cvText: string;
  brokerRequest: string;
  clientProfile: ClientInsights;
  similarCases: Array<{ analysis: unknown; decision: string; score?: number }>;
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

  const formattedCases = formatPreparationSimilarCases(params.similarCases);

  return `
<cv>
${params.cvText.trim() || 'CV not provided'}
</cv>

<broker_request>
${params.brokerRequest.trim() || 'Broker request not provided'}
</broker_request>

<client_profile>
Summary: ${clientProfile.summary || 'not available'}
Based on: ${clientProfile.basedOnInterviews} interview(s)
Top questions:
${topQuestionsJson}
Success patterns: ${successPatterns}
Failure patterns: ${failurePatterns}
Red flags: ${redFlags}
</client_profile>

<similar_cases>
${formattedCases || 'No similar cases available'}
</similar_cases>

Generate the candidate preparation document for the upcoming interview with this client.
Use the data from the client profile and the candidate's CV to personalise every recommendation.
Follow the section order, sub-formats, and writing rules from the system prompt strictly.
`.trim();
}

function formatPreparationSimilarCases(
  cases: Array<{ analysis: unknown; decision: string; score?: number }>,
): string {
  if (cases.length === 0) return '';

  return cases
    .map((c, i) => {
      const a = (c.analysis ?? {}) as Record<string, unknown>;
      const findings: string[] = [];

      if (Array.isArray(a.strengths) && a.strengths.length > 0) {
        findings.push(
          `Strengths: ${(a.strengths as string[]).slice(0, 3).join('; ')}`,
        );
      }
      if (Array.isArray(a.weaknesses) && a.weaknesses.length > 0) {
        findings.push(
          `Weaknesses: ${(a.weaknesses as string[]).slice(0, 3).join('; ')}`,
        );
      }
      if (Array.isArray(a.decisionBreakers) && a.decisionBreakers.length > 0) {
        findings.push(
          `Decision breakers: ${(a.decisionBreakers as string[]).slice(0, 3).join('; ')}`,
        );
      }

      const scorePart =
        typeof c.score === 'number' ? ` | Score: ${c.score}` : '';

      return `Case ${i + 1}: Decision: ${c.decision}${scorePart}
${findings.join('\n') || 'No findings recorded'}`;
    })
    .join('\n\n');
}
