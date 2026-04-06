import { parseIssue, findCandidatesForManagerCall } from '../services/linear.parser';

async function main() {
  const ISSUE_ID = 'a9702d13-fb70-4ddc-9d50-5058212aabe8';

  const parsed = await parseIssue(ISSUE_ID);

  console.log('=== PARSED ISSUE ===');
  console.log('role:', parsed.role);
  console.log('clientName:', parsed.clientName);
  console.log('status:', parsed.status);
  console.log('candidates found:', parsed.candidates.length);

  for (const c of parsed.candidates) {
    console.log('\n--- CANDIDATE ---');
    console.log('rootCommentId:', c.rootCommentId);
    console.log('cvUrl:', c.cvUrl);
    console.log('managerCallTranscriptUrl:', c.managerCallTranscriptUrl);
    console.log('managerFeedback:', c.managerFeedback?.slice(0, 100));
    console.log('technicalCallTranscriptUrl:', c.technicalCallTranscriptUrl);
    console.log('finalDecision:', c.finalDecision);
  }

  const readyForManager = findCandidatesForManagerCall(parsed.candidates);
  console.log('\nReady for manager call analysis:', readyForManager.length);
}

main().catch(console.error);