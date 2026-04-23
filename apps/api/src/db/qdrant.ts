import { QdrantClient } from '@qdrant/js-client-rest';
import { describeError } from '../utils/errorLogger';

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  ...(process.env.QDRANT_API_KEY ? { apiKey: process.env.QDRANT_API_KEY } : {}),
});

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'interviews';

// Поля, по которым фильтруем в rag.service — для них Qdrant требует payload index.
const PAYLOAD_KEYWORD_INDEXES = ['role', 'level', 'clientName', 'stage', 'decision'];

async function ensurePayloadIndexes() {
  for (const field of PAYLOAD_KEYWORD_INDEXES) {
    try {
      await qdrant.createPayloadIndex(COLLECTION, {
        field_name: field,
        field_schema: 'keyword',
        wait: true,
      });
      console.log(`Qdrant payload index ensured: ${field}`);
    } catch (err: any) {
      // createPayloadIndex на уже существующем индексе возвращает ok,
      // но на всякий случай глушим конфликты — остальное логируем.
      const msg = err?.data?.status?.error ?? err?.message ?? '';
      if (/already exists|existing index/i.test(String(msg))) continue;
      console.warn(`[stage:qdrant] createPayloadIndex(${field}) failed`, describeError(err));
    }
  }
}

export async function initQdrantCollection() {
  const { collections } = await qdrant.getCollections();
  const exists = collections.some(c => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: {
        size: 1024,
        distance: 'Cosine',
      },
    });
    console.log(`Qdrant collection "${COLLECTION}" created`);
  } else {
    console.log(`Qdrant collection "${COLLECTION}" already exists`);
  }

  // Индексы создаём идемпотентно в обоих случаях:
  // они нужны для фильтрации в findSimilarInterviews.
  await ensurePayloadIndexes();
}

export { COLLECTION };