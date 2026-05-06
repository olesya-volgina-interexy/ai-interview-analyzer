import { prisma } from '../db/prisma';
import { clusterTextItems } from './llm.service';
import type { ClientInsights } from '@shared/schemas';

const HANDLED_SCORE: Record<string, number> = {
  well: 3,
  partial: 2,
  poor: 1,
};

function avgScoreToHandled(score: number): 'well' | 'partial' | 'poor' {
  if (score >= 2.5) return 'well';
  if (score >= 1.5) return 'partial';
  return 'poor';
}

const NO_TOPIC = 'Без темы';

interface RawQuestion {
  question: string;
  topic?: string;
  candidateHandled?: 'well' | 'partial' | 'poor' | 'skipped';
}

export async function aggregateClientQuestions(clientName: string): Promise<ClientInsights['topQuestions']> {
  const interviews = await prisma.interview.findMany({
    where: { clientName, questions: { not: { equals: null } } },
    select: { questions: true },
  });

  const all: RawQuestion[] = [];
  for (const i of interviews) {
    const arr = i.questions as unknown;
    if (!Array.isArray(arr)) continue;
    for (const q of arr) {
      if (q && typeof q === 'object' && typeof (q as any).question === 'string') {
        all.push(q as RawQuestion);
      }
    }
  }

  // Группировка по topic
  const byTopic = new Map<string, { questions: string[]; scores: number[] }>();
  for (const q of all) {
    const topic = q.topic?.trim() || NO_TOPIC;
    let bucket = byTopic.get(topic);
    if (!bucket) {
      bucket = { questions: [], scores: [] };
      byTopic.set(topic, bucket);
    }
    bucket.questions.push(q.question);
    if (q.candidateHandled && q.candidateHandled !== 'skipped') {
      bucket.scores.push(HANDLED_SCORE[q.candidateHandled]);
    }
  }

  const items: ClientInsights['topQuestions'] = [];
  for (const [topic, { questions, scores }] of byTopic) {
    // Самый частый текст вопроса в теме — как репрезентант
    const freq: Record<string, number> = {};
    for (const q of questions) freq[q] = (freq[q] ?? 0) + 1;
    const topQuestion = Object.entries(freq).sort(([, a], [, b]) => b - a)[0]![0];

    const avg = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    items.push({
      question: topQuestion,
      topic,
      frequency: questions.length,
      avgHandled: avg !== null ? avgScoreToHandled(avg) : 'partial',
    });
  }

  items.sort((a, b) => b.frequency - a.frequency);
  return items.slice(0, 20);
}

export async function aggregateClientPatterns(clientName: string): Promise<{
  successPatterns: string[];
  failurePatterns: string[];
  redFlags: string[];
  managerStyles: ClientInsights['managerStyles'];
  basedOnInterviews: number;
}> {
  const interviews = await prisma.interview.findMany({
    where: { clientName },
    select: { stage: true, analysis: true, managerName: true },
  });

  const allStrengths: string[] = [];
  const allWeaknesses: string[] = [];
  const allBreakers: string[] = [];
  const managerMap = new Map<string, { count: number; scores: number[] }>();

  for (const i of interviews) {
    const a = i.analysis as any;
    if (!a || typeof a !== 'object') continue;

    if (Array.isArray(a.strengths))        allStrengths.push(...a.strengths.filter((s: unknown): s is string => typeof s === 'string'));
    if (Array.isArray(a.weaknesses))       allWeaknesses.push(...a.weaknesses.filter((s: unknown): s is string => typeof s === 'string'));
    if (Array.isArray(a.decisionBreakers)) allBreakers.push(...a.decisionBreakers.filter((s: unknown): s is string => typeof s === 'string'));

    if (i.managerName) {
      let m = managerMap.get(i.managerName);
      if (!m) { m = { count: 0, scores: [] }; managerMap.set(i.managerName, m); }
      m.count++;
      if (i.stage === 'technical' && typeof a.score === 'number') m.scores.push(a.score);
    }
  }

  // clusterTextItems имеет встроенный fallback и не бросает — оборачивать не нужно.
  const [successCluster, failureCluster, redFlagsCluster] = await Promise.all([
    allStrengths.length  > 0 ? clusterTextItems(allStrengths,  'strengths')         : Promise.resolve([]),
    allWeaknesses.length > 0 ? clusterTextItems(allWeaknesses, 'weaknesses')        : Promise.resolve([]),
    allBreakers.length   > 0 ? clusterTextItems(allBreakers,   'decision_breakers') : Promise.resolve([]),
  ]);

  const managerStyles = Array.from(managerMap.entries()).map(([managerName, m]) => ({
    managerName,
    interviewCount: m.count,
    avgScore: m.scores.length > 0
      ? Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length)
      : null,
  }));

  return {
    successPatterns: successCluster.map(c => c.text),
    failurePatterns: failureCluster.map(c => c.text),
    redFlags:        redFlagsCluster.map(c => c.text),
    managerStyles,
    basedOnInterviews: interviews.length,
  };
}

export async function buildClientProfile(clientName: string): Promise<ClientInsights> {
  const [topQuestions, patterns] = await Promise.all([
    aggregateClientQuestions(clientName),
    aggregateClientPatterns(clientName),
  ]);

  const topTopics = topQuestions.slice(0, 5).map(q => q.topic).join(', ');
  const summary = patterns.basedOnInterviews === 0
    ? `Нет интервью для клиента ${clientName}.`
    : `Профиль на основе ${patterns.basedOnInterviews} интервью. Основные темы: ${topTopics || 'не определены'}.`;

  const profile: ClientInsights = {
    summary,
    topQuestions,
    successPatterns: patterns.successPatterns,
    failurePatterns: patterns.failurePatterns,
    redFlags: patterns.redFlags,
    managerStyles: patterns.managerStyles,
    basedOnInterviews: patterns.basedOnInterviews,
    generatedAt: new Date().toISOString(),
  };

  await prisma.client.update({
    where: { name: clientName },
    data: { insights: profile },
  });

  return profile;
}
