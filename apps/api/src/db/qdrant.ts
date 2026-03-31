import { QdrantClient } from '@qdrant/js-client-rest';

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
});

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'interviews';

export async function initQdrantCollection() {
  const { collections } = await qdrant.getCollections();
  const exists = collections.some(c => c.name === COLLECTION);

  if (exists) {
    await qdrant.deleteCollection(COLLECTION);
    console.log(`Qdrant collection "${COLLECTION}" deleted`);
  }
  await qdrant.createCollection(COLLECTION, {
      vectors: {
        size: 1024,
        distance: 'Cosine',
      },
    });
    console.log(`Qdrant collection "${COLLECTION}" created`);
}

export { COLLECTION };