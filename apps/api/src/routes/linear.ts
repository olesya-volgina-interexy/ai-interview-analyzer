import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getIssueData,
  normalizeIssueIdentifier,
  extractAttachmentUrl,
  splitVacancies,
  parseIssueTitle,
} from '../services/linear.service';

const PreviewBodySchema = z.object({
  idOrUrl: z.string().min(1),
});

export async function linearRoutes(fastify: FastifyInstance) {
  // POST /linear/issue/preview — read-only fetch для предзаполнения формы
  // ручной подготовительной доки. В БД ничего не пишет.
  fastify.post('/linear/issue/preview', async (request, reply) => {
    const parsed = PreviewBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid body',
        details: parsed.error.flatten(),
      });
    }

    const issueId = normalizeIssueIdentifier(parsed.data.idOrUrl);
    if (!issueId) {
      return reply.status(400).send({
        error:
          'Could not extract a Linear issue identifier. Provide an ID (e.g. LIN-1234), full URL, or UUID.',
      });
    }

    try {
      const issue = await getIssueData(issueId);
      const attachmentUrl = issue.description
        ? extractAttachmentUrl(issue.description)
        : null;

      const splitVacanciesRaw = issue.description
        ? splitVacancies(issue.description)
        : [];

      const vacancies = splitVacanciesRaw.map((v) => {
        const parsed = parseIssueTitle(v.title);
        return {
          title: v.title,
          content: v.content,
          parsedRole: parsed.role,
          parsedClientName: parsed.clientName,
        };
      });

      return {
        issueId: issue.id,
        identifier: issueId,
        title: issue.title,
        description: issue.description,
        parsedRole: issue.role,
        parsedClientName: issue.clientName,
        attachmentUrl,
        vacancies,
      };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      fastify.log.warn({ err, issueId }, 'Linear issue preview failed');
      if (status === 404) {
        return reply
          .status(404)
          .send({ error: `Linear issue ${issueId} not found` });
      }
      return reply
        .status(502)
        .send({ error: 'Failed to fetch issue from Linear' });
    }
  });
}
