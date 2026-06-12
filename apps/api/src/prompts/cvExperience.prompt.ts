// Prompt for structured extraction of a candidate's technology experience
// from raw CV text. Used by cvExperienceExtractor.service to fill the
// "Резюме кандидата" table in manual preparation docs.

export const CV_EXPERIENCE_SYSTEM_PROMPT = `You extract structured technology experience from a candidate's CV.

Goal: produce a table with one row per meaningful technology, listing total
years of experience and the projects/periods where that technology was used.

Rules:
1. ONE ROW per distinct technology/tool/framework (e.g. "React", "PostgreSQL",
   "AWS Lambda"). Do NOT include generic soft skills ("communication",
   "teamwork") or vague categories ("Frontend", "Backend").
2. Group similar tech sensibly: "React" and "React.js" → one row. "Node" and
   "Node.js" → one row. "PostgreSQL" and "Postgres" → one row.
3. "totalDuration" — string, copy/summarise what the CV says about how long
   the candidate has used this tech. If the CV does not state it directly,
   estimate from the project periods ("~3 years", "since 2021"). Keep it
   short — under 30 characters.
4. "projects" — array of { name, period } objects. Each entry describes one
   project/role where this technology was used and the period.
   - "name" — short project or company name (under 60 chars). If the CV
     only says "freelance" or "personal projects", use that.
   - "period" — exact dates as written ("Jan 2020 — Dec 2022", "2021–2023",
     "6 months in 2024"). Do NOT invent dates.
   - If a technology is mentioned without project context, return projects
     as an empty array — do not fabricate.
5. Output language: use the same language as the CV for project names and
   period descriptions. Technology names stay as written by the candidate.
6. Skip technologies that appear only in "interests" / "learning" sections
   without real project experience.

Return strictly valid JSON in this shape:
{
  "rows": [
    {
      "technology": "string",
      "totalDuration": "string",
      "projects": [{ "name": "string", "period": "string" }]
    }
  ]
}

If the CV is empty, unreadable, or contains no extractable tech experience,
return { "rows": [] }.`;

export function buildCvExperienceUserMessage(cvText: string): string {
  return `CV TEXT:\n\n${cvText}`;
}
