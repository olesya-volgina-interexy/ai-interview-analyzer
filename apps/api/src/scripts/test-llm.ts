import { llmClient, LLM_MODEL } from '../services/llm.client';

async function main() {
  const res = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [{ role: 'user', content: 'Скажи "привет" по-английски' }],
  });

  console.log(res.choices[0].message.content);
}

main().catch(console.error);