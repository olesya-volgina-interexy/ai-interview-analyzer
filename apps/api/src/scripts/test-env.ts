import { config } from 'dotenv';
import { resolve } from 'path';

const result = config({ path: resolve(__dirname, '../../../../.env') });

console.log('dotenv result:', result);
console.log('LLM_API_KEY:', process.env.LLM_API_KEY);
console.log('LLM_BASE_URL:', process.env.LLM_BASE_URL);
console.log('LLM_MODEL:', process.env.LLM_MODEL);