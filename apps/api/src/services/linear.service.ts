// apps/api/src/services/linear.service.ts

import { LinearClient } from '@linear/sdk';

export const linear = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

// ── Типы ──────────────────────────────────────────────────────────────────

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  parent: { id: string } | null;
}

export interface LinearIssueData {
  id: string;
  title: string;
  description: string | null;
  stateName: string;
  clientName: string | null;
  role: string;
  labels: string[];
}

// ── Получить данные тикета ─────────────────────────────────────────────────

export async function getIssueData(issueId: string): Promise<LinearIssueData> {
  const issue = await linear.issue(issueId);

  const [state, labels] = await Promise.all([
    issue.state,
    issue.labels(),
  ]);

  const labelNames = labels.nodes.map(l => l.name);
  const { role, clientName: titleClient } = parseIssueTitle(issue.title ?? '');
  const clientName = titleClient ?? labelNames[0] ?? null;

  return {
    id: issue.id,
    title: issue.title ?? '',
    description: issue.description ?? null,
    stateName: state?.name ?? 'unknown',
    clientName,
    role,
    labels: labelNames,
  };
}

// ── Получить все комментарии тикета с parent.id через GraphQL ──────────────

export async function getIssueComments(issueId: string): Promise<LinearComment[]> {
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
  const comments = result.data.issue.comments.nodes as LinearComment[];

  // Сортируем от старых к новым
  return comments.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// ── Постинг reply в ветку кандидата ───────────────────────────────────────

export async function postReply(
  issueId: string,
  parentId: string,
  body: string
): Promise<void> {
  await linear.createComment({ issueId, parentId, body });
}

// ── Вспомогательные функции ────────────────────────────────────────────────

// Парсинг роли и клиента из заголовка тикета
// Форматы: "Role for Company" или "Role - Company"
export function parseIssueTitle(title: string): {
  role: string;
  clientName: string | null;
} {
  const forMatch = title.match(/^(.+?)\s+for\s+(.+)$/i);
  if (forMatch) {
    return {
      role: forMatch[1].trim(),
      clientName: forMatch[2].trim(),
    };
  }

  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) {
    return {
      role: dashMatch[1].trim(),
      clientName: dashMatch[2].trim(),
    };
  }

  return { role: title.trim(), clientName: null };
}

// Извлечь чистый URL из Linear Markdown формата [text](<url>) или просто url
export function extractUrl(text: string): string | null {
  // Формат Linear: [text](<url>)
  const markdownMatch = text.match(/\(<(https?:\/\/[^>]+)>\)/);
  if (markdownMatch) return markdownMatch[1];

  // Обычная ссылка
  const plainMatch = text.match(/https?:\/\/[^\s)>\]]+/);
  if (plainMatch) return plainMatch[0];

  return null;
}

// Извлечь текст фидбека — убрать хэштег и мусор Linear форматирования
export function extractFeedbackText(body: string): string {
  return body
    .replace(/\[#feedback_manager_call\]\(<#feedback_manager_call>\)/g, '')
    .replace(/#feedback_manager_call/g, '')
    .replace(/\(<>\)/g, '')
    .trim();
}


// Извлечь URL вложения из Linear Markdown формата [filename](url)
export function extractAttachmentUrl(body: string): string | null {
  const match = body.match(/\[([^\]]+\.(txt|pdf|docx?))\]\((https?:\/\/[^)]+)\)/i);
  return match ? match[3] : null;
}