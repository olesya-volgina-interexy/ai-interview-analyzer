import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import OpenAI from 'openai';

const embeddingClient = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

// Returns vector of size 1024 (Qwen text-embedding-v3)
export async function embedText(text: string): Promise<number[]> {
  const truncated = text.slice(0, 8000);

  const res = await embeddingClient.embeddings.create({
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-v4',
    input: truncated,
  });

  return res.data[0].embedding;
}

export function buildEmbeddingText(
  transcript: string,
  cvText?: string,
  brokerRequest?: string
): string {
  return [
    transcript,
    cvText ? `CV:\n${cvText.slice(0, 2000)}` : '',
    brokerRequest ? `Запрос брокера:\n${brokerRequest.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n\n');
}