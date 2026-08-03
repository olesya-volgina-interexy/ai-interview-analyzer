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
  // Дополнения к запросу брокера из корневых комментариев с #brokers_request.
  // Накапливаются (append) и подмешиваются к запросу при анализе.
  brokerRequestSupplement: string | null;
  status: string;
  stateId: string | null;
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

  // Дополнения к запросу брокера: корневые комментарии с #brokers_request.
  // Накапливаем все непустые тексты в порядке появления.
  const brokerRequestSupplement = rootComments
    .filter(root => root.body.includes('#brokers_request'))
    .map(root => extractBrokerRequestText(root.body))
    .filter(text => text.length > 0)
    .join('\n\n') || null;

  return {
    issueId,
    title: issueData.title,
    role: issueData.role,
    clientName: issueData.clientName,
    brokerRequest: issueData.description,
    brokerRequestSupplement,
    status: issueData.stateName,
    stateId: issueData.stateId,
    candidates,
  };
}

// ── Парсинг одной ветки кандидата ─────────────────────────────────────────

function parseCandidateThread(
  root: LinearComment,
  replies: LinearComment[]
): CandidateThread {
  // visualcv-ссылка ИЛИ файл (PDF/DOC/TXT), приложенный к root-комментарию.
  const cvUrl = extractCvUrlFromComment(root.body);

  const managerTranscriptReply = replies.find(r =>
    containsHashtag(r.body, '#manager_call_transcript')
  );
  const feedbackReply = replies.find(r =>
    containsHashtag(r.body, '#feedback_manager_call')
  );
  const techTranscriptReply = replies.find(r =>
    containsHashtag(r.body, '#technical_call_transcript')
  );
  // #hired/#lost раньше сверялись строгим равенством (body.trim() === '#hired'),
  // поэтому любой дописанный к маркеру текст молча отключал финальный анализ.
  const hiredReply = replies.find(r => containsHashtag(r.body, '#hired'));
  const lostReply = replies.find(r => containsHashtag(r.body, '#lost'));

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
  // Коммент-дополнение к запросу брокера — не ветка кандидата.
  // Иначе его текст (часто содержит "cv"/"resume") ложно матчится ниже.
  if (containsHashtag(root.body, '#brokers_request')) return false;

  const hasCV = root.body.includes('my.visualcv.com') ||
    root.body.includes('visualcv') ||
    root.body.toLowerCase().includes('cv') ||
    root.body.toLowerCase().includes('resume');

  const hasHashtag = [...replies, root].some(c =>
    containsHashtag(c.body, '#manager_call_transcript') ||
    containsHashtag(c.body, '#technical_call_transcript') ||
    containsHashtag(c.body, '#feedback_manager_call') ||
    containsHashtag(c.body, '#hired') ||
    containsHashtag(c.body, '#lost')
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

// Комментарий со стадийным хэштегом несёт транскрипт/фидбек/решение, а не CV.
// Проверка обязательна перед детектом резюме: транскрипты прикладывают файлом
// в том же markdown-формате, что и CV ([name.txt](url) / [name.pdf](url), см.
// extractAttachmentUrl), поэтому иначе каждый транскрипт распознаётся как новое
// резюме — лишняя карточка в пайплайне и накрутка cvSentCount.
// #brokers_request здесь же: это дополнение к запросу брокера, его текст часто
// содержит "cv"/"resume" (ср. isCandidateThread).
const STAGE_HASHTAGS = [
  '#manager_call_transcript',
  '#technical_call_transcript',
  '#feedback_manager_call',
  '#hired',
  '#lost',
  '#brokers_request',
];

// Хэштег как отдельный токен, в любом месте комментария. Достаточно свободно,
// чтобы к маркеру можно было дописать текст ("#hired, стартует в понедельник")
// и чтобы срабатывала markdown-форма, которую иногда подставляет Linear —
// [#hired](<#hired>). Lookahead не даёт #hired поймать #hired_soon.
export function containsHashtag(body: string, hashtag: string): boolean {
  const tag = hashtag.replace(/^#/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`#${tag}(?![\\w-])`, 'i').test(body);
}

export function hasStageHashtag(body: string): boolean {
  return STAGE_HASHTAGS.some(hashtag => containsHashtag(body, hashtag));
}

// CV из комментария: либо visualcv-ссылка, либо приложенный файлом
// (PDF/DOC/TXT). Вызывать только после hasStageHashtag.
export function extractCvUrlFromComment(body: string): string | null {
  const visualcv = extractCVUrl(body);
  if (visualcv) return visualcv;

  const attachment = body.match(
    /\[[^\]]+\.(?:pdf|docx?|txt|rtf)\]\(<?(https?:\/\/[^)>]+)>?\)/i,
  );
  return attachment ? attachment[1] : null;
}

// CV из bodyData root-комментария: Linear хранит приложенные файлы как
// file-ноды ProseMirror (type: 'file', attrs: { href, name, mimetype }).
// Webhook не отдаёт эту ссылку в markdown — забираем её из bodyData.
export function extractCvAttachmentFromBodyData(bodyData: string | null): string | null {
  if (!bodyData) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(bodyData);
  } catch {
    return null;
  }
  return findCvFileHref(doc);
}

function findCvFileHref(node: any): string | null {
  if (!node || typeof node !== 'object') return null;

  if (node.type === 'file' && node.attrs?.href) {
    const name = String(node.attrs.name ?? '');
    const mimetype = String(node.attrs.mimetype ?? '');
    const isCvFile =
      mimetype === 'application/pdf' ||
      mimetype.includes('wordprocessingml') ||
      mimetype === 'application/msword' ||
      /\.(pdf|docx?|txt|rtf)$/i.test(name);
    if (isCvFile) return String(node.attrs.href);
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findCvFileHref(child);
      if (found) return found;
    }
  }
  return null;
}

// ── Извлечь текст дополнения к запросу брокера ────────────────────────────
// Срезаем хэштег #brokers_request в обеих формах: голый и markdown-ссылку,
// которую иногда подставляет Linear ([#brokers_request](<#brokers_request>)).

export function extractBrokerRequestText(body: string): string {
  return body
    .replace(/\[#brokers_request\]\(<#brokers_request>\)/g, '')
    .replace(/#brokers_request/g, '')
    .trim();
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