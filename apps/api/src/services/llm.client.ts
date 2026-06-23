import OpenAI from 'openai';

// maxRetries: SDK default is 2, which is not enough to ride out TPM window
// slides on tier-1 (30k TPM gpt-4o). Step 1 of technical analysis consumes
// most of the per-minute budget, so Step 2 firing immediately after often
// hits "Used 30000, try again in Xs". With 6 retries and SDK's built-in
// exponential backoff that respects retry-after headers, the second call
// reliably succeeds.
export const llmClient = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
  maxRetries: 6,
});

export const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o';

// Step 1 / extraction over the full transcript — needs high TPM headroom so we
// don't have to truncate. gpt-4.1-mini: ~200k TPM on tier 1, 1M context.
export const LLM_MODEL_EXTRACTION = process.env.LLM_MODEL_EXTRACTION ?? LLM_MODEL;

// Step 2 / assessment writing — small input, quality matters most.
export const LLM_MODEL_ASSESSMENT = process.env.LLM_MODEL_ASSESSMENT ?? LLM_MODEL;