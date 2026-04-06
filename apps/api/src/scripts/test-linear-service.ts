import { getIssueData, getIssueComments } from '../services/linear.service';

async function main() {
  const ISSUE_ID = 'a9702d13-fb70-4ddc-9d50-5058212aabe8'; // ID тестового тикета

  const data = await getIssueData(ISSUE_ID);
  console.log('Issue data:', JSON.stringify(data, null, 2));

  const comments = await getIssueComments(ISSUE_ID);
  console.log('Comments:', comments.length);
  console.log('Roots:', comments.filter(c => !c.parent?.id).length);
  console.log('Replies:', comments.filter(c => !!c.parent?.id).length);
}

main().catch(console.error);