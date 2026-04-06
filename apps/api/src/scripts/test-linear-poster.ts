import { postManagerCallAnalysis } from '../services/linear.poster';

async function main() {
  const ISSUE_ID = 'a9702d13-fb70-4ddc-9d50-5058212aabe8';
  const PARENT_COMMENT_ID = '863903bc-5441-47a5-a3b5-45dc912e2f27'; // root CV комментарий

  // Тестовый анализ
  const mockAnalysis = {
    stage: 'manager_call' as const,
    overallImpression: 'Strong candidate with excellent communication skills.',
    softSkills: {
      communication: 'Clear and structured, native-level English',
      motivation: 'Highly motivated, looking for growth opportunities',
      cultureFit: 'Good fit for international team environment',
      salaryExpectations: '$4000-4200/month, within budget',
      clarityOfThought: 'Excellent, answers are well-structured',
    },
    strengths: ['Strong English', 'Clear communication', 'Relevant experience'],
    weaknesses: ['Notice period 4-5 weeks'],
    risks: ['Slightly above initial salary budget'],
    brokerSoftFit: {
      coveredRequirements: ['English B2+', 'Remote work experience'],
      missingRequirements: [],
      fitSummary: 'Candidate meets all soft requirements from broker.',
    },
    stageResult: 'passed' as const,
    reasoning: 'Candidate demonstrated strong soft skills and motivation.',
    decisionBreakers: [],
    recommendation: 'Proceed to technical interview. Confirm salary expectations.',
  };

  console.log('Posting manager call analysis...');
  await postManagerCallAnalysis(ISSUE_ID, PARENT_COMMENT_ID, mockAnalysis);
  console.log('✅ Done! Check Linear issue for the comment.');
}

main().catch(console.error);