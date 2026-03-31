import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

async function main() {
  const models = await client.models.list();
  models.data.forEach(m => console.log(m.id));
}

main();