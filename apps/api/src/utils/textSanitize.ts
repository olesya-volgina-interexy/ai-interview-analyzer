// ─── Null-byte sanitization ──────────────────────────────────────────────────
//
// Postgres rejects null bytes (\0 / U+0000) in TEXT and JSONB columns with
// error 22021 ("invalid byte sequence for encoding UTF8: 0x00"). Null bytes
// can sneak in from many sources: PDF text extraction, Puppeteer-rendered
// content (embedded NULs in HTML), Linear/Slack uploads, transcripts pasted
// from terminal-based tools, OCR output. They also confuse LLM tokenizers
// when present in large numbers.
//
// Sanitize early (at fetch source) AND late (right before DB write) — defense
// in depth, since transcripts flow through many paths before storage.

export function stripNullBytes(s: string | null | undefined): string {
  if (s == null) return '';
  return s.replace(/\0/g, '');
}

// Recursively strip null bytes from every string in a value tree. Used before
// JSON-serializing the LLM analysis output for storage in JSONB columns —
// even if the LLM doesn't emit \0 directly, it can echo bytes from the input
// transcript if quoted verbatim.
export function stripNullBytesDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === 'string') return stripNullBytes(value) as unknown as T;
  if (Array.isArray(value)) return value.map(stripNullBytesDeep) as unknown as T;
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = stripNullBytesDeep(v);
    }
    return result as unknown as T;
  }
  return value;
}
