import { llmClient, LLM_MODEL } from './llm.client';
import { extractCVText } from './cv.service';
import { buildClientProfile } from './clientProfile.service';
import { getIssueData, extractAttachmentUrl } from './linear.service';
import {
  extractExperienceTable,
  renderExperienceTableMarkdown,
  type ExperienceTable,
} from './cvExperienceExtractor.service';
import { prisma } from '../db/prisma';
import {
  CLIENT_SECTION_SYSTEM_PROMPT,
  buildClientSectionUserMessage,
} from '../prompts/clientSection.prompt';
import { runStage, describeError } from '../utils/errorLogger';
import type { ClientInsights } from '@shared/schemas';

export type PreparationDocProgress = 'context' | 'cv' | 'client' | 'llm';

export interface GeneratePreparationDocResult {
  markdown: string;
  sourceInterviewIds: string[];
}

export async function generatePreparationDoc(params: {
  candidateName: string;
  clientName: string;
  role?: string;
  linearIssueId?: string;
  cvText?: string;
  cvUrl?: string;
  brokerRequest?: string;
  onProgress?: (stage: PreparationDocProgress) => void | Promise<void>;
}): Promise<GeneratePreparationDocResult> {
  const { candidateName, clientName } = params;
  let role = params.role;
  let brokerRequest = params.brokerRequest?.trim() || undefined;
  let resolvedCvUrl = params.cvUrl;
  let cvText = params.cvText?.trim() || undefined;

  // 1. Linear-тикет — подтянуть отсутствующие поля.
  if (params.linearIssueId) {
    try {
      const issue = await runStage(
        'linear',
        () => getIssueData(params.linearIssueId!),
        { op: 'getIssueData', issueId: params.linearIssueId },
      );
      if (!brokerRequest && issue.description) brokerRequest = issue.description;
      if (!role && issue.role) role = issue.role;
      if (!resolvedCvUrl && issue.description) {
        const att = extractAttachmentUrl(issue.description);
        if (att) resolvedCvUrl = att;
      }
    } catch (err) {
      console.warn('[preparation] failed to load Linear issue', {
        issueId: params.linearIssueId,
        ...describeError(err),
      });
    }
  }

  // 2. PipelineCandidate fallback — для кандидатов, которые уже есть в системе.
  if (!cvText || !resolvedCvUrl || !role) {
    const candidate = await runStage(
      'db',
      () =>
        prisma.pipelineCandidate.findFirst({
          where: { candidateName, clientName },
          orderBy: { cvSubmittedAt: 'desc' },
          select: { cvUrl: true, cvText: true, role: true },
        }),
      { op: 'pipelineCandidate.findFirst', candidateName, clientName },
    );
    if (candidate) {
      if (!role && candidate.role) role = candidate.role;
      if (!cvText && candidate.cvText) cvText = candidate.cvText;
      if (!cvText && !resolvedCvUrl && candidate.cvUrl) {
        resolvedCvUrl = candidate.cvUrl;
      }
    }
  }

  // 3. IncomingRequest fallback — для brokerRequest/role.
  if (!brokerRequest || !role) {
    const incoming = await runStage(
      'db',
      () =>
        prisma.incomingRequest.findFirst({
          where: { clientName },
          orderBy: { receivedAt: 'desc' },
          select: { brokerRequest: true, role: true },
        }),
      { op: 'incomingRequest.findFirst', clientName },
    );
    if (incoming) {
      brokerRequest = brokerRequest ?? incoming.brokerRequest ?? undefined;
      role = role ?? incoming.role ?? undefined;
    }
  }

  // 4. Извлекаем CV-текст из URL, если есть только ссылка.
  if (!cvText && resolvedCvUrl) {
    cvText = await runStage(
      'cv',
      () => extractCVText(resolvedCvUrl!),
      { op: 'extractCVText', cvUrl: resolvedCvUrl },
    );
  }

  await params.onProgress?.('context');

  // 5. Структурированная таблица опыта (LLM-вызов #1).
  const experienceTable: ExperienceTable = cvText
    ? await runStage('llm', () => extractExperienceTable(cvText!), {
        op: 'extractExperienceTable',
      })
    : { rows: [] };

  await params.onProgress?.('cv');

  // 6. Профиль клиента — пытаемся построить. Если клиента нет в БД или нет
  // истории интервью — секция «вопросы клиента» будет заглушкой.
  let clientProfile: ClientInsights | null = null;
  try {
    clientProfile = await runStage(
      'llm',
      () => buildClientProfile(clientName),
      { op: 'buildClientProfile', clientName },
    );
  } catch (err) {
    console.warn('[preparation] buildClientProfile failed, treating as missing', {
      clientName,
      ...describeError(err),
    });
  }

  await params.onProgress?.('client');

  // 7. Секция вопросов клиента — либо LLM-вызов #2, либо заглушка.
  const hasClientHistory =
    !!clientProfile && clientProfile.basedOnInterviews > 0;

  const clientSectionMarkdown = hasClientHistory
    ? await runStage(
        'llm',
        () =>
          generateClientQuestionsSection({
            clientName,
            role,
            cvText: cvText ?? '',
            clientProfile: clientProfile!,
          }),
        { op: 'generateClientQuestionsSection', clientName },
      )
    : renderClientPlaceholder(clientName);

  await params.onProgress?.('llm');

  // 8. Собираем итоговый markdown в коде.
  const markdown = renderPreparationDocMarkdown({
    candidateName,
    role,
    brokerRequest,
    cvUrl: resolvedCvUrl,
    experienceTable,
    clientSectionMarkdown,
  });

  return {
    markdown,
    sourceInterviewIds: [],
  };
}

// ── LLM-вызов для секции вопросов клиента ─────────────────────────────────

async function generateClientQuestionsSection(params: {
  clientName: string;
  role: string | undefined;
  cvText: string;
  clientProfile: ClientInsights;
}): Promise<string> {
  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: CLIENT_SECTION_SYSTEM_PROMPT },
      { role: 'user', content: buildClientSectionUserMessage(params) },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  });

  const choice = response.choices[0];
  const content = choice.message.content?.trim() ?? '';

  if (choice.finish_reason === 'length') {
    console.warn('[preparation] client section truncated (max_tokens hit)', {
      clientName: params.clientName,
    });
  }

  if (!content) {
    return renderClientPlaceholder(params.clientName);
  }

  // На случай если LLM начнёт ответ с лишних пробелов/кавычек/кода — приведём
  // к виду, начинающемуся ровно с "## Подготовка к вопросам клиента".
  return normaliseClientSection(content, params.clientName);
}

function normaliseClientSection(content: string, clientName: string): string {
  // Срезаем code-fence обёртку, если LLM нарушил инструкцию.
  let s = content.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // Если ответ не начинается с нужного заголовка — добавляем его.
  if (!/^##\s+Подготовка к вопросам клиента/i.test(s)) {
    // Возможно LLM добавил какое-то вступление — попробуем найти заголовок.
    const idx = s.search(/##\s+Подготовка к вопросам клиента/i);
    if (idx >= 0) {
      s = s.slice(idx);
    } else {
      // LLM проигнорировал формат — сделаем минимальный валидный блок.
      return renderClientPlaceholder(clientName);
    }
  }
  return s;
}

// ── Заглушка при отсутствии истории клиента ───────────────────────────────

function renderClientPlaceholder(clientName: string): string {
  return [
    '## Подготовка к вопросам клиента',
    '',
    `_По клиенту **${clientName}** пока нет накопленной истории интервью._`,
    '_Секция заполнится автоматически по мере проведения собеседований и накопления данных._',
  ].join('\n');
}

// ── Сборка финального markdown ────────────────────────────────────────────

function renderPreparationDocMarkdown(params: {
  candidateName: string;
  role: string | undefined;
  brokerRequest: string | undefined;
  cvUrl: string | undefined;
  experienceTable: ExperienceTable;
  clientSectionMarkdown: string;
}): string {
  const { candidateName, role, brokerRequest, cvUrl, experienceTable, clientSectionMarkdown } =
    params;

  const title = role
    ? `# ${candidateName} for ${role}`
    : `# ${candidateName}`;

  const brokerBlock = [
    '## Запрос от брокера',
    '',
    brokerRequest?.trim() || '_Не указан._',
  ].join('\n');

  const cvLink = cvUrl
    ? `**Ссылка:** ${cvUrl}`
    : '**Ссылка:** _загружено вручную_';

  const cvBlock = [
    '## Резюме кандидата',
    '',
    cvLink,
    '',
    renderExperienceTableMarkdown(experienceTable),
  ].join('\n');

  const footerLinks = readFooterLinks();
  const footerBlock = footerLinks.length > 0
    ? ['---', '', ...footerLinks.map((url) => `- ${url}`)].join('\n')
    : '';

  const parts = [title, '', brokerBlock, '', cvBlock, '', clientSectionMarkdown];
  if (footerBlock) parts.push('', footerBlock);

  return parts.join('\n').trim() + '\n';
}

function readFooterLinks(): string[] {
  const raw = process.env.PREP_DOC_FOOTER_LINKS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
