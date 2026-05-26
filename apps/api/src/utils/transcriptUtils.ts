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

// 40k chars ≈ 10k tokens. Combined with system prompt (~3.5k) + broker (~0.5k)
// + max_completion 8k = ~22k for Step 1, leaving ~8k headroom in the per-minute
// TPM window for Step 2 to fire immediately after without waiting. Larger caps
// force the SDK to retry Step 2 across multiple minute windows.
export const MAX_TRANSCRIPT_CHARS = 40_000;

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
