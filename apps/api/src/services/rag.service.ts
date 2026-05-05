import { qdrant, COLLECTION } from '../db/qdrant';

interface EmbeddingPayload {
  role: string;
  level: string;
  decision: string;
  clientName?: string;
  [key: string]: unknown;
}

export async function saveEmbedding(
  interviewId: string,
  vector: number[],
  payload: EmbeddingPayload
): Promise<void> {
  await qdrant.upsert(COLLECTION, {
    points: [{
      id: interviewId,
      vector,
      payload,
    }],
  });
}

export async function findSimilarInterviews(
  vector: number[],
  filters: { role: string; level: string; stage?: string; clientName?: string },
  limit = 3
): Promise<string[]> {

  const baseMust: Array<{ key: string; match: { value: string } }> = [
    { key: 'role', match: { value: filters.role } },
    { key: 'level', match: { value: filters.level } },
  ];
  if (filters.stage) {
    baseMust.push({ key: 'stage', match: { value: filters.stage } });
  }

  // Сначала ищем по клиенту + роли + уровню (+ stage, если задан)
  if (filters.clientName) {
    const withClient = await qdrant.search(COLLECTION, {
      vector,
      limit,
      filter: {
        must: [
          ...baseMust,
          { key: 'clientName', match: { value: filters.clientName } },
        ],
      },
      with_payload: false,
    });

    if (withClient.length >= limit) {
      return withClient.map(r => r.id as string);
    }
  }

  // Fallback — без фильтра по клиенту
  const general = await qdrant.search(COLLECTION, {
    vector,
    limit,
    filter: {
      must: baseMust,
    },
    with_payload: false,
  });

  return general.map(r => r.id as string);
}