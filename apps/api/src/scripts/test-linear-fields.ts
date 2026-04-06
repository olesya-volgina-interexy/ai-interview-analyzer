import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../../.env') });

import { LinearClient } from '@linear/sdk';

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

function parseIssueTitle(title: string): { role: string; clientName: string | null } {
  const forMatch = title.match(/^(.+?)\s+for\s+(.+)$/i);
  if (forMatch) return { role: forMatch[1].trim(), clientName: forMatch[2].trim() };
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) return { role: dashMatch[1].trim(), clientName: dashMatch[2].trim() };
  return { role: title.trim(), clientName: null };
}

// Извлечь чистый URL из Linear Markdown формата [url](<url>) или просто url
function extractUrl(text: string): string | null {
  // Формат Linear: [text](<url>) или [url](<url>)
  const markdownMatch = text.match(/\(<(https?:\/\/[^>]+)>\)/);
  if (markdownMatch) return markdownMatch[1];

  // Обычная ссылка
  const plainMatch = text.match(/https?:\/\/[^\s)>\]]+/);
  if (plainMatch) return plainMatch[0];

  return null;
}

// Прямой GraphQL запрос — получить комментарии с parent.id
async function getCommentsWithParent(issueId: string) {
  const query = `
    query GetComments($issueId: String!) {
      issue(id: $issueId) {
        comments(first: 100) {
          nodes {
            id
            body
            createdAt
            parent {
              id
            }
          }
        }
      }
    }
  `;

  const result = await (linear as any).client.rawRequest(query, { issueId });
  return result.data.issue.comments.nodes as Array<{
    id: string;
    body: string;
    createdAt: string;
    parent: { id: string } | null;
  }>;
}

async function main() {
  const TICKET_NUMBER = 8;

  const issues = await linear.issues({ filter: { number: { eq: TICKET_NUMBER } } });
  const issue = issues.nodes[0];
  if (!issue) { console.log('Issue not found'); return; }

  console.log('Found issue ID:', issue.id);
  const issueDetail = await linear.issue(issue.id);

  console.log('\n=== BASIC FIELDS ===');
  console.log('title:', issueDetail.title);
  console.log('description (first 200):', issueDetail.description?.slice(0, 200));

  console.log('\n=== CLIENT NAME PARSING ===');
  const parsed = parseIssueTitle(issueDetail.title ?? '');
  console.log('role:', parsed.role);
  const labels = await issueDetail.labels();
  const labelNames = labels.nodes.map(l => l.name);
  const clientName = parsed.clientName ?? labelNames[0] ?? null;
  console.log('→ FINAL clientName:', clientName);

  console.log('\n=== STATE ===');
  const state = await issueDetail.state;
  console.log('state name:', state?.name);

  console.log('\n=== COMMENTS WITH PARENT (GraphQL) ===');
  const comments = await getCommentsWithParent(issue.id);
  console.log('total:', comments.length);

  // Сортируем по дате (от старых к новым)
  comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rootComments = comments.filter(c => !c.parent?.id);
  const replyComments = comments.filter(c => !!c.parent?.id);

  console.log('root:', rootComments.length);
  console.log('replies:', replyComments.length);

  // Группируем replies по parentId
  const repliesByParent: Record<string, typeof comments> = {};
  for (const reply of replyComments) {
    const pid = reply.parent!.id;
    if (!repliesByParent[pid]) repliesByParent[pid] = [];
    repliesByParent[pid].push(reply);
  }

  console.log('\n=== COMMENT THREADS ===');
  for (const root of rootComments) {
    console.log('\n┌── ROOT ──────────────────────────────');
    console.log('│ id:', root.id);
    console.log('│ body:', root.body.slice(0, 200));

    // Определяем тип
    if (root.body.includes('my.visualcv.com')) {
      const url = extractUrl(root.body.match(/\[?https?:\/\/my\.visualcv\.com[^\s\]>)]+/)?.[0] ?? root.body);
      console.log('│ ✅ TYPE: CV link →', url);
    }
    if (root.body.includes('#manager_call_transcript')) {
      const url = extractUrl(root.body);
      console.log('│ ✅ TYPE: manager_call_transcript →', url);
    }
    if (root.body.includes('#technical_call_transcript')) {
      const url = extractUrl(root.body);
      console.log('│ ✅ TYPE: technical_call_transcript →', url);
    }
    if (root.body.includes('#feedback_manager_call')) {
      const text = root.body.replace(/\[?#feedback_manager_call\]?(<[^>]*>)?/g, '').trim();
      console.log('│ ✅ TYPE: feedback_manager_call');
      console.log('│    text:', text.slice(0, 150));
    }
    if (root.body.trim() === '#hired') console.log('│ ✅ TYPE: hired');
    if (root.body.trim() === '#lost') console.log('│ ✅ TYPE: lost');

    // Replies
    const replies = repliesByParent[root.id] ?? [];
    if (replies.length > 0) {
      console.log(`│\n│ replies (${replies.length}):`);
      for (const reply of replies) {
        console.log('│  ├── REPLY ─────────────────────');
        console.log('│  │ id:', reply.id);
        console.log('│  │ body:', reply.body.slice(0, 200));

        if (reply.body.includes('my.visualcv.com')) {
          const url = extractUrl(reply.body);
          console.log('│  │ ✅ TYPE: CV link →', url);
        }
        if (reply.body.includes('#manager_call_transcript')) {
          const url = extractUrl(reply.body);
          console.log('│  │ ✅ TYPE: manager_call_transcript →', url);
        }
        if (reply.body.includes('#technical_call_transcript')) {
          const url = extractUrl(reply.body);
          console.log('│  │ ✅ TYPE: technical_call_transcript →', url);
        }
        if (reply.body.includes('#feedback_manager_call')) {
          const text = reply.body.replace(/\[?#feedback_manager_call\]?(<[^>]*>)?/g, '').trim();
          console.log('│  │ ✅ TYPE: feedback_manager_call');
          console.log('│  │    text:', text.slice(0, 150));
        }
        if (reply.body.trim() === '#hired') console.log('│  │ ✅ TYPE: hired');
        if (reply.body.trim() === '#lost') console.log('│  │ ✅ TYPE: lost');
      }
    } else {
      console.log('│ (no replies)');
    }
    console.log('└──────────────────────────────────────');
  }
}

main().catch(console.error);