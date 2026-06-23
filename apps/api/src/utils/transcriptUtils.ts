// ─── Transcript length guard ─────────────────────────────────────────────────
//
// gpt-4o on tier 1 has a 30k tokens-per-minute hard limit. A single technical
// analysis call sends transcript + system prompt + broker_request + reserved
// max_completion_tokens; long Bluedot/Linear transcripts (60-90 min calls,
// 60-80KB of text) push us past that limit and the request fails with 429.
//
// truncateTranscript caps the transcript at MAX_TRANSCRIPT_CHARS using a
// head+tail strategy: keep the beginning (intro, role context, main technical
// discussion) AND the end (closing remarks, candidate's reverse questions,
// any final reactions). Sacrifice the middle, which usually contains the
// densest part of the discussion but is also the most repetitive.
//
// The result includes a wasTruncated flag and counts so downstream code can
// honestly surface to the user that part of the transcript was not analysed.

// 40k chars ≈ 10k tokens. This low cap is sized for gpt-4o on tier 1 (30k TPM):
// transcript + system prompt (~3.5k) + broker (~0.5k) + max_completion 8k must
// fit the per-minute window. It is the fallback cap, used when extraction runs
// on the same low-TPM model. With a high-TPM extraction model the caller passes
// EXTRACTION_MAX_TRANSCRIPT_CHARS instead so the transcript is kept whole.
export const MAX_TRANSCRIPT_CHARS = 40_000;

// Extraction runs on a high-TPM model (e.g. gpt-4.1-mini: ~200k TPM, 1M context),
// so we keep the whole transcript. This cap stays only as a hard safety bound
// (~50k tokens) against pathological inputs and the context window.
export const EXTRACTION_MAX_TRANSCRIPT_CHARS =
  Number(process.env.MAX_TRANSCRIPT_CHARS_EXTRACTION) || 200_000;

const HEAD_RATIO = 0.7;  // keep first 70% of the budget from the start
const TAIL_RATIO = 0.25; // and 25% from the end; 5% reserved for the marker

export interface TruncationResult {
  text: string;
  wasTruncated: boolean;
  originalChars: number;
  finalChars: number;
  droppedChars: number;
  droppedPercent: number;
}

export function truncateTranscript(transcript: string, max = MAX_TRANSCRIPT_CHARS): TruncationResult {
  const originalChars = transcript.length;

  if (originalChars <= max) {
    return {
      text: transcript,
      wasTruncated: false,
      originalChars,
      finalChars: originalChars,
      droppedChars: 0,
      droppedPercent: 0,
    };
  }

  const headChars = Math.floor(max * HEAD_RATIO);
  const tailChars = Math.floor(max * TAIL_RATIO);
  const droppedChars = originalChars - headChars - tailChars;
  const droppedPercent = Math.round((droppedChars / originalChars) * 100);

  const marker = `\n\n[... TRUNCATED ${droppedChars.toLocaleString()} chars (~${droppedPercent}% of the transcript) — middle section omitted to fit token limits ...]\n\n`;

  const text = transcript.slice(0, headChars) + marker + transcript.slice(-tailChars);

  return {
    text,
    wasTruncated: true,
    originalChars,
    finalChars: text.length,
    droppedChars,
    droppedPercent,
  };
}
