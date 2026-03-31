import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });
import OpenAI from 'openai';

export const llmClient = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

export const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen-plus';