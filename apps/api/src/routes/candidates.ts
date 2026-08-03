import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { clusterTextItems } from '../services/llm.service';
import { getScore, avg } from '../utils/scoring';
import type { Prisma } from '@prisma/client';

// Порядок таблеток стадий в пайплайне — по ходу воронки, а не по дате анализа.
const STAGE_DISPLAY_ORDER = ['manager_call', 'technical', 'final_result'] as const;

export async function candidateRoutes(fastify: FastifyInstance) {

  fastify.get('/candidates', async (request) => {
    const { search, page, limit, role, result } = request.query as {
      search?: string;
      page?: string;
      limit?: string;
      role?: string;
      result?: 'hired' | 'not_hired';
    };

    const take = Number(limit ?? 20);
    const skip = (Number(page ?? 1) - 1) * take;

    // Строим условия WHERE
    const conditions: string[] = [`"candidateName" IS NOT NULL`];
    const values: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`LOWER("candidateName") LIKE LOWER($${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (role) {
      conditions.push(`role = $${idx}`);
      values.push(role);
      idx++;
    }

    const where = conditions.join(' AND ');

    // Агрегация на уровне SQL
    const rows = await prisma.$queryRawUnsafe<Array<{
      candidateName: string;
      totalInterviews: bigint;
      successful: bigint;
      failed: bigint;
      lastInterviewAt: Date;
      roles: string;
    }>>(
      `SELECT
        "candidateName",
        COUNT(*) as "totalInterviews",
        COUNT(*) FILTER (WHERE decision = 'hired') as "successful",
        COUNT(*) FILTER (WHERE decision = 'rejected') as "failed",
        MAX("createdAt") as "lastInterviewAt",
        STRING_AGG(DISTINCT role, ',') as roles
      FROM "Interview"
      WHERE ${where}
      GROUP BY LOWER("candidateName"), "candidateName"
      ORDER BY MAX("createdAt") DESC`,
      ...values
    );

    // Считаем avgScore отдельно — JSON поле не агрегируется в SQL легко
    const names = rows.map(r => r.candidateName);
    const scoreRows = names.length > 0
      ? await prisma.interview.findMany({
          where: { candidateName: { in: names } },
          select: { candidateName: true, analysis: true },
        })
      : [];

    const scoreMap: Record<string, number[]> = {};
    for (const r of scoreRows) {
      const score = getScore(r.analysis);
      if (typeof score === 'number' && r.candidateName) {
        const key = r.candidateName.toLowerCase();
        if (!scoreMap[key]) scoreMap[key] = [];
        scoreMap[key].push(score);
      }
    }

    let candidates = rows.map(r => {
      const scores = scoreMap[r.candidateName.toLowerCase()] ?? [];
      return {
        candidateName: r.candidateName,
        totalInterviews: Number(r.totalInterviews),
        successful: Number(r.successful),
        failed: Number(r.failed),
        lastInterviewAt: r.lastInterviewAt.toISOString(),
        roles: r.roles ? r.roles.split(',') : [],
        avgScore: avg(scores),
      };
    });

    // Фильтр по result (hired/not_hired) — после агрегации
    if (result === 'hired') candidates = candidates.filter(c => c.successful > 0);
    if (result === 'not_hired') candidates = candidates.filter(c => c.successful === 0);

    // Пагинация
    return candidates.slice(skip, skip + take);
  });

  fastify.get<{ Params: { name: string } }>(
    '/candidates/:name',
    async (request, reply) => {
      const name = decodeURIComponent(request.params.name);

      const interviews = await prisma.interview.findMany({
        where: {
          candidateName: { equals: name, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          stage: true,
          role: true,
          level: true,
          decision: true,
          clientName: true,
          managerName: true,
          analysis: true,
          analysisDate: true,
          createdAt: true,
          linearIssueId: true,
        },
      });

      if (interviews.length === 0) {
        return reply.status(404).send({ error: 'Candidate not found' });
      }

      // Собираем strengths, weaknesses и decisionBreakers
      const allStrengths: string[] = [];
      const allWeaknesses: string[] = [];
      const allDecisionBreakers: string[] = [];

      for (const i of interviews) {
        const analysis = i.analysis as any;
        for (const s of analysis?.strengths ?? []) {
          if (s && (s as string).toLowerCase() !== 'not mentioned') {
            allStrengths.push(s as string);
          }
        }
        // Софт скиллы из manager_call тоже считаем как strengths
        if (analysis?.softSkills) {
          const soft = analysis.softSkills as Record<string, string>;
          for (const [key, value] of Object.entries(soft)) {
            if (value && value.toLowerCase() !== 'not mentioned') {
              allStrengths.push(`${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`);
            }
          }
        }
        for (const w of analysis?.weaknesses ?? []) {
          if (w && (w as string).toLowerCase() !== 'not mentioned') {
            allWeaknesses.push(w as string);
          }
        }
        for (const db of analysis?.decisionBreakers ?? []) {
          if (db) allDecisionBreakers.push(db as string);
        }
      }

      const [topStrengths, topWeaknesses, topDecisionBreakers] = await Promise.all([
        allStrengths.length > 0
          ? clusterTextItems(allStrengths, 'strengths')
          : Promise.resolve([]),
        allWeaknesses.length > 0
          ? clusterTextItems(allWeaknesses, 'weaknesses')
          : Promise.resolve([]),
        allDecisionBreakers.length > 0
          ? clusterTextItems(allDecisionBreakers, 'decision_breakers')
          : Promise.resolve([]),
      ]);

      const scores = interviews
        .map(i => getScore(i.analysis))
        .filter((s): s is number => typeof s === 'number');

      // CV sent stats
      const issueIds = interviews
        .map(i => i.linearIssueId)
        .filter((id): id is string => !!id);

      const cvStats = issueIds.length > 0
        ? await prisma.incomingRequest.aggregate({
            where: { linearIssueId: { in: issueIds } },
            _sum: { cvSentCount: true },
          })
        : { _sum: { cvSentCount: 0 } };

      const totalCvSent = cvStats._sum.cvSentCount ?? 0;

      return {
        candidateName: name,
        totalInterviews: interviews.length,
        totalCvSent,
        successful: interviews.filter(i => i.decision === 'hired').length,
        failed: interviews.filter(i => i.decision === 'rejected').length,
        avgScore: avg(scores),
        roles: [...new Set(interviews.map(i => i.role))],
        topStrengths,
        topWeaknesses,
        topDecisionBreakers,
        interviews: interviews.map(i => ({
          id: i.id,
          stage: i.stage,
          role: i.role,
          level: i.level,
          decision: i.decision,
          clientName: i.clientName,
          managerName: i.managerName,
          createdAt: i.createdAt.toISOString(),
          analysisDate: i.analysisDate ? i.analysisDate.toISOString() : null,
          recommendation: (i.analysis as any)?.recommendation ?? null,
          stageResult: (i.analysis as any)?.stageResult ?? null,
          score: getScore(i.analysis) ?? null,
        })),
      };
    }
  );

  fastify.get('/pipeline-candidates', async (request) => {
    const { search, hasInterviews, clientName, role, from, to, page, limit } = request.query as {
      search?: string;
      hasInterviews?: 'yes' | 'no';
      clientName?: string;
      role?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };

    const take = Number(limit ?? 20);
    const skip = (Number(page ?? 1) - 1) * take;
    // Отдаём на одну строку больше запрошенного — пробник «есть ли ещё
    // страница». Раньше этот +1 добавлял фронт к самому limit, из-за чего skip
    // сдвигался на 21 при показанных 20 и кандидат на стыке страниц не попадал
    // ни в одну из них.
    const probe = take + 1;

    const where: Prisma.PipelineCandidateWhereInput = {};

    if (search) {
      where.candidateName = { contains: search, mode: 'insensitive' };
    }
    if (clientName) {
      where.clientName = { equals: clientName, mode: 'insensitive' };
    }
    if (role) {
      where.role = { equals: role, mode: 'insensitive' };
    }
    if (from || to) {
      where.cvSubmittedAt = {};
      if (from) where.cvSubmittedAt.gte = new Date(from);
      if (to) where.cvSubmittedAt.lte = new Date(to);
    }

    // Пагинацию применяем ПОСЛЕ группировки, поэтому тянем весь отфильтрованный
    // набор, а не страницу: одна карточка = одно резюме, и несколько резюме
    // одного человека на одну вакансию сворачиваются в одну строку (см. ниже).
    const candidates = await prisma.pipelineCandidate.findMany({
      where,
      orderBy: { cvSubmittedAt: 'desc' },
      select: {
        id: true,
        candidateName: true,
        cvUrl: true,
        level: true,
        role: true,
        clientName: true,
        cvSubmittedAt: true,
        linearIssueId: true,
        rootCommentId: true,
      },
    });

    if (candidates.length === 0) return [];

    const issueIds = candidates.map(c => c.linearIssueId);
    const commentIds = candidates.map(c => c.rootCommentId);

    const interviews = await prisma.interview.findMany({
      where: {
        linearIssueId: { in: issueIds },
        parentCommentId: { in: commentIds },
      },
      select: {
        linearIssueId: true,
        parentCommentId: true,
        stage: true,
        decision: true,
        createdAt: true,
      },
    });

    const interviewMap = new Map<string, typeof interviews>();
    for (const iv of interviews) {
      const key = `${iv.linearIssueId}:${iv.parentCommentId}`;
      if (!interviewMap.has(key)) interviewMap.set(key, []);
      interviewMap.get(key)!.push(iv);
    }

    // Повторно прикреплённое резюме одного и того же человека на ОДНУ вакансию —
    // это не второй кандидат, а вторая версия CV, поэтому строки сворачиваем и
    // отдаём количество с датами. Один человек на РАЗНЫХ вакансиях остаётся
    // отдельными строками: это разные процессы со своими стадиями.
    // Карточки без распознанного имени не группируем — под "—" попали бы
    // разные люди.
    const groups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const name = c.candidateName?.trim().toLowerCase();
      const key = name ? `${c.linearIssueId}::${name}` : `id::${c.id}`;
      const group = groups.get(key);
      if (group) group.push(c);
      else groups.set(key, [c]);
    }

    const result = [...groups.values()].map(group => {
      // Порядок из запроса (cvSubmittedAt desc) сохраняется, поэтому первая
      // карточка группы — самое свежее резюме, оно и представляет строку.
      const latest = group[0];
      const firstOf = <K extends 'level' | 'role' | 'clientName'>(field: K) =>
        group.find(c => c[field] != null)?.[field] ?? null;

      // Интервью привязаны к корню треда, а ключ карточки может быть реплаем —
      // поэтому собираем по всем комментариям группы, а не только по свежему.
      const ivs = group.flatMap(c => interviewMap.get(`${c.linearIssueId}:${c.rootCommentId}`) ?? []);
      const byRecency = [...ivs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Отдаём ВСЕ пройденные стадии, а не только последнюю: кандидат мог
      // пройти и менеджер-колл, и техничку, и финал — в колонке нужны все
      // таблетки. На стадию берём самый свежий анализ (мог быть переанализ).
      // Interview.stage — свободная строка, поэтому известные стадии выводим в
      // порядке воронки, а всё незнакомое дописываем в конец, а не теряем.
      const seen = [...new Set(byRecency.map(i => i.stage))];
      const ordered = [
        ...STAGE_DISPLAY_ORDER.filter(s => seen.includes(s)),
        ...seen.filter(s => !STAGE_DISPLAY_ORDER.includes(s as any)),
      ];
      const stages = ordered.map(stage => ({
        stage,
        decision: byRecency.find(i => i.stage === stage)?.decision ?? null,
      }));

      return {
        id: latest.id,
        candidateName: latest.candidateName,
        cvUrl: latest.cvUrl,
        level: firstOf('level'),
        role: firstOf('role'),
        clientName: firstOf('clientName'),
        cvSubmittedAt: latest.cvSubmittedAt.toISOString(),
        cvCount: group.length,
        cvSubmittedDates: group.map(c => c.cvSubmittedAt.toISOString()),
        linearIssueId: latest.linearIssueId,
        interviewCount: ivs.length,
        stages,
      };
    });

    const filtered =
      hasInterviews === 'yes' ? result.filter(r => r.interviewCount > 0) :
      hasInterviews === 'no' ? result.filter(r => r.interviewCount === 0) :
      result;

    return filtered.slice(skip, skip + probe);
  });
}