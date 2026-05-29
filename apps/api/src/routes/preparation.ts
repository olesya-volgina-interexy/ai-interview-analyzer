import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GeneratePreparationDocRequestSchema } from '@shared/schemas';
import { prisma } from '../db/prisma';
import { preparationQueue, type PreparationJobData } from '../workers/preparation.worker';
import { markdownToPdf } from '../services/pdf.service';

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  clientName: z.string().optional(),
  candidateName: z.string().optional(),
});

const PREPARATION_LIST_SELECT = {
  id: true,
  candidateName: true,
  clientName: true,
  brokerRequest: true,
  sourceInterviewIds: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

function buildPreparationJobId(docId: string): string {
  return `preparation-${docId}`;
}

function serializeDoc<T extends { createdAt: Date; updatedAt: Date }>(doc: T) {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function preparationRoutes(fastify: FastifyInstance) {
  // POST /preparation — create doc + queue job
  fastify.post('/preparation', async (request, reply) => {
    const body = GeneratePreparationDocRequestSchema.parse(request.body);

    // Resolve cvUrl from PipelineCandidate when candidateId is given
    // (more reliable than the candidateName lookup the service does as fallback).
    let cvUrl: string | undefined;
    if (body.candidateId) {
      const pc = await prisma.pipelineCandidate.findUnique({
        where: { id: body.candidateId },
        select: { cvUrl: true },
      });
      cvUrl = pc?.cvUrl ?? undefined;
    }

    const doc = await prisma.preparationDoc.create({
      data: {
        candidateName: body.candidateName,
        clientName: body.clientName,
        brokerRequest: body.brokerRequest,
        markdown: '',
        sourceInterviewIds: [],
        status: 'pending',
      },
    });

    const jobData: PreparationJobData = {
      preparationDocId: doc.id,
      candidateName: body.candidateName,
      clientName: body.clientName,
      role: body.role,
      linearIssueId: body.linearIssueId,
      cvText: body.cvText,
      cvUrl: body.cvUrl ?? cvUrl,
      brokerRequest: body.brokerRequest,
    };

    const job = await preparationQueue.add('preparation', jobData, {
      jobId: buildPreparationJobId(doc.id),
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
    });

    return reply.status(202).send({ id: doc.id, jobId: job.id });
  });

  // GET /preparation/:id/status — for the polling loop
  fastify.get<{ Params: { id: string } }>(
    '/preparation/:id/status',
    async (request, reply) => {
      const { id } = request.params;
      const doc = await prisma.preparationDoc.findUnique({ where: { id } });

      if (!doc) {
        return reply.status(404).send({ error: 'Preparation doc not found' });
      }

      const job = await preparationQueue.getJob(buildPreparationJobId(id));
      const progress = typeof job?.progress === 'number' ? job.progress : 0;

      const base = {
        id: doc.id,
        status: doc.status,
        progress,
        error: doc.error,
      };

      if (doc.status === 'completed') {
        return { ...base, doc: serializeDoc(doc) };
      }

      return base;
    },
  );

  // GET /preparation/:id/pdf — рендерим markdown в PDF on-demand
  fastify.get<{ Params: { id: string } }>(
    '/preparation/:id/pdf',
    async (request, reply) => {
      const { id } = request.params;
      const doc = await prisma.preparationDoc.findUnique({ where: { id } });

      if (!doc) {
        return reply.status(404).send({ error: 'Preparation doc not found' });
      }
      if (doc.status !== 'completed') {
        return reply
          .status(409)
          .send({ error: 'Preparation doc is not ready yet', status: doc.status });
      }

      const title = `${doc.candidateName} — preparation`;
      const pdf = await markdownToPdf(doc.markdown, title);

      const safeName = `${doc.candidateName}-${doc.clientName}-prep.pdf`
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${safeName}"`)
        .send(pdf);
    },
  );

  // GET /preparation/:id — full doc when ready
  fastify.get<{ Params: { id: string } }>(
    '/preparation/:id',
    async (request, reply) => {
      const { id } = request.params;
      const doc = await prisma.preparationDoc.findUnique({ where: { id } });

      if (!doc) {
        return reply.status(404).send({ error: 'Preparation doc not found' });
      }

      if (doc.status !== 'completed') {
        return reply.status(202).send({
          id: doc.id,
          status: doc.status,
          error: doc.error,
        });
      }

      return serializeDoc(doc);
    },
  );

  // GET /preparation — list with pagination + filters, no markdown
  fastify.get('/preparation', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }
    const { page, limit, clientName, candidateName } = parsed.data;

    const where = {
      ...(clientName && { clientName }),
      ...(candidateName && { candidateName }),
    };

    const [items, total] = await Promise.all([
      prisma.preparationDoc.findMany({
        where,
        select: PREPARATION_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.preparationDoc.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map(serializeDoc),
    };
  });
}
