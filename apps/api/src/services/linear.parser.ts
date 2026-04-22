// apps/api/src/services/linear.parser.ts

import {
  getIssueData,
  getIssueComments,
  extractUrl,
  extractFeedbackText,
  extractAttachmentUrl,
  type LinearComment,
  type LinearIssueData,
} from './linear.service';

// ── Типы ──────────────────────────────────────────────────────────────────

export interface CandidateThread {
  rootCommentId: string;
  cvUrl: string | null;
  managerCallTranscriptUrl: string | null;
  managerFeedback: string | null;
  managerName: string | null;
  technicalCallTranscriptUrl: string | null;
  finalDecision: 'hired' | 'lost' | null;
}

export interface ParsedIssue {
  issueId: string;
  title: string;
  role: string;
  clientName: string | null;
  brokerRequest: string | null;
  status: string;
  candidates: CandidateThread[];
}

// ── Главная функция парсинга тикета ───────────────────────────────────────

export async function parseIssue(issueId: string): Promise<ParsedIssue> {
  const [issueData, comments] = await Promise.all([
    getIssueData(issueId),
    getIssueComments(issueId),
  ]);

  // Разделяем на root и replies
  const rootComments = comments.filter(c => !c.parent?.id);
  const replyComments = comments.filter(c => !!c.parent?.id);

  // Группируем replies по parentId
  const repliesByParent: Record<string, LinearComment[]> = {};
  for (const reply of replyComments) {
    const pid = reply.parent!.id;
    if (!repliesByParent[pid]) repliesByParent[pid] = [];
    repliesByParent[pid].push(reply);
  }

  // Парсим каждую ветку кандидата
  const candidates = rootComments
    .filter(root => isCandidateThread(root, repliesByParent[root.id] ?? []))
    .map(root => parseCandidateThread(root, repliesByParent[root.id] ?? []));

  return {
    issueId,
    title: issueData.title,
    role: issueData.role,
    clientName: issueData.clientName,
    brokerRequest: issueData.description,
    status: issueData.stateName,
    candidates,
  };
}

// ── Парсинг одной ветки кандидата ─────────────────────────────────────────

function parseCandidateThread(
  root: LinearComment,
  replies: LinearComment[]
): CandidateThread {
  const cvUrl = extractCVUrl(root.body);

  const managerTranscriptReply = replies.find(r =>
    r.body.includes('#manager_call_transcript')
  );
  const feedbackReply = replies.find(r =>
    r.body.includes('#feedback_manager_call')
  );
  const techTranscriptReply = replies.find(r =>
    r.body.includes('#technical_call_transcript')
  );
  const hiredReply = replies.find(r => r.body.trim() === '#hired');
  const lostReply = replies.find(r => r.body.trim() === '#lost');

  return {
    rootCommentId: root.id,
    cvUrl,
    // Сначала ищем вложение (файл), потом обычную ссылку
    managerCallTranscriptUrl: managerTranscriptReply
      ? (extractAttachmentUrl(managerTranscriptReply.body) ?? extractUrl(managerTranscriptReply.body))
      : null,
    managerName: feedbackReply
      ? extractManagerName(feedbackReply.body)
      : null,
    managerFeedback: feedbackReply
      ? extractFeedbackText(feedbackReply.body).replace(/Manager:\s*[^\n]+\n?/i, '').trim()
      : null,
    technicalCallTranscriptUrl: techTranscriptReply
      ? (extractAttachmentUrl(techTranscriptReply.body) ?? extractUrl(techTranscriptReply.body))
      : null,
    finalDecision: hiredReply ? 'hired' : lostReply ? 'lost' : null,
  };
}

// ── Определить является ли ветка веткой кандидата ─────────────────────────
// Ветка кандидата = root содержит CV ссылку ИЛИ replies содержат хэштеги

function isCandidateThread(
  root: LinearComment,
  replies: LinearComment[]
): boolean {
  const hasCV = root.body.includes('my.visualcv.com') ||
    root.body.includes('visualcv') ||
    root.body.toLowerCase().includes('cv') ||
    root.body.toLowerCase().includes('resume');

  const hasHashtag = [...replies, root].some(c =>
    c.body.includes('#manager_call_transcript') ||
    c.body.includes('#technical_call_transcript') ||
    c.body.includes('#feedback_manager_call') ||
    c.body.trim() === '#hired' ||
    c.body.trim() === '#lost'
  );

  return hasCV || hasHashtag;
}

// ── Извлечь CV URL (всегда my.visualcv.com) ───────────────────────────────

export function extractCVUrl(body: string): string | null {
  // Формат Linear markdown: [url](<url>)
  const markdownMatch = body.match(
    /\(<(https?:\/\/my\.visualcv\.com\/[^>]+)>\)/
  );
  if (markdownMatch) return markdownMatch[1];

  // Обычная ссылка
  const plainMatch = body.match(/https?:\/\/my\.visualcv\.com\/[^\s)>\]]+/);
  if (plainMatch) return plainMatch[0];

  return null;
}

// ── Извлечь имя менеджера из "Manager: Name" ─────────────────────────────

function extractManagerName(body: string): string | null {
  const match = body.match(/Manager:\s*([^\n]+)/i);
  if (!match) return null;
  const name = match[1].trim();
  return name.length > 0 ? name : null;
}

// ── Фильтры для поиска кандидатов готовых к анализу ──────────────────────

export function findCandidatesForManagerCall(
  candidates: CandidateThread[]
): CandidateThread[] {
  return candidates.filter(c =>
    c.managerCallTranscriptUrl !== null &&
    c.managerFeedback !== null
  );
}

export function findCandidatesForTechCall(
  candidates: CandidateThread[]
): CandidateThread[] {
  return candidates.filter(c =>
    c.technicalCallTranscriptUrl !== null
  );
}

export function findCandidatesForFinalResult(
  candidates: CandidateThread[],
  decision: 'hired' | 'lost'
): CandidateThread[] {
  return candidates.filter(c => c.finalDecision === decision);
}