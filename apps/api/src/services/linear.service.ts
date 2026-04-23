// apps/api/src/services/linear.service.ts

import { LinearClient } from '@linear/sdk';

// Нормализуем ключ: часто в env попадают пробелы/кавычки/перенос строки,
// а иногда — префикс "Bearer ". Убираем всё, что может сломать авторизацию.
function normalizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, '').trim();
  return v || undefined;
}

const LINEAR_API_KEY = normalizeApiKey(process.env.LINEAR_API_KEY);

export const linear = new LinearClient({
  apiKey: LINEAR_API_KEY,
});

// Диагностика на старте — дергаем простой запрос и логируем результат.
// Не роняем процесс: лучше живой сервер с видимой ошибкой авторизации,
// чем тихий crash-loop в Render.
export async function verifyLinearAuth(): Promise<void> {
  if (!LINEAR_API_KEY) {
    console.error('[linear] LINEAR_API_KEY is not set');
    return;
  }
  try {
    const data = await linearGraphQL<{ viewer: { id: string; email: string; name: string } }>(
      'query { viewer { id email name } }',
      {}
    );
    console.log(`[linear] auth OK as ${data.viewer.email} (${data.viewer.name})`);
  } catch (err: any) {
    console.error('[linear] auth check FAILED — token is invalid/revoked/misformatted', {
      status: err?.status,
      errors: err?.errors,
      keyLength: LINEAR_API_KEY.length,
      keyPrefix: LINEAR_API_KEY.slice(0, 6),
    });
  }
}

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

// ── Прямой GraphQL-запрос к Linear API ────────────────────────────────────
// В Linear SDK v26 внутренний client.rawRequest теряет API-ключ,
// поэтому отправляем запрос напрямую — контроль над заголовками 100%.

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

async function linearGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  if (!LINEAR_API_KEY) {
    throw new Error('LINEAR_API_KEY is not set — cannot call Linear GraphQL');
  }

  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data?: T; errors?: unknown };

  if (!res.ok || json.errors) {
    const err = new Error('Linear GraphQL request failed') as Error & {
      status?: number;
      data?: unknown;
      errors?: unknown;
    };
    err.status = res.status;
    err.errors = json.errors;
    err.data = json;
    throw err;
  }

  if (!json.data) {
    throw new Error('Linear GraphQL response has no data');
  }

  return json.data;
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

  const data = await linearGraphQL<{
    issue: { comments: { nodes: LinearComment[] } };
  }>(query, { issueId });

  const comments = data.issue.comments.nodes;

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