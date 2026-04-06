import { analyzeFinalResult } from '../services/llm.service';

async function main() {
  const previousAnalyses = `
=== MANAGER CALL ===
Stage Result: passed
Overall Impression: Strong candidate with excellent English and communication.
Soft Skills: Communication excellent, motivation high, culture fit good.
Strengths: Clear English, structured answers, motivated
Weaknesses: Notice period 4-5 weeks
Reasoning: Candidate passed all soft criteria, ready for technical stage.

=== TECHNICAL CALL ===
Recommendation: hire
Score: 82/100
Detected Level: Senior
Overall Assessment: Strong backend engineer with proven AWS and Node.js experience.
CV Match: 92% — all major skills confirmed
Broker Match: 88% — covers TypeScript, Node.js, PostgreSQL, Docker, AWS
Strengths: Deep PostgreSQL knowledge, real AWS production experience
Weaknesses: No direct Kafka experience (RabbitMQ only)
Reasoning: Candidate meets all hard requirements. Kafka gap is minor.
`;

  console.log('Analyzing final result (hired)...');
  const result = await analyzeFinalResult(previousAnalyses, 'hired');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);