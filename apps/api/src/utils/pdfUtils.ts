// ─── PDF text post-processing ────────────────────────────────────────────────
//
// pdf-parse extracts raw text from PDFs, but real-world transcripts and CVs
// (Zoom/Fireflies/Otter exports, scanned recruiter docs) introduce artefacts
// that confuse downstream parsing and LLM analysis:
//   - literal "\n" / "\t" sequences (escaped instead of real whitespace)
//   - null bytes (\0) which break JSON serialization
//   - mixed CRLF / CR-only line endings
//   - long runs of blank lines that bloat token counts
//   - non-breaking spaces and zero-width characters from copy-paste sources
//
// sanitizePdfText is intentionally pure and side-effect free; apply it
// immediately after pdfParse(buffer).text and before any further processing.

export function sanitizePdfText(raw: string): string {
  if (!raw) return '';

  return raw
    .replace(/\0/g, '')                  // remove null bytes
    .replace(/\\n/g, '\n')               // literal \n → real newline
    .replace(/\\t/g, '\t')               // literal \t → real tab
    .replace(/\\r/g, '\n')               // literal \r → newline
    .replace(/\r\n/g, '\n')              // normalize CRLF
    .replace(/\r/g, '\n')                // normalize CR-only
    .replace(/ /g, ' ')             // non-breaking space → regular space
    .replace(/[​-‍﻿]/g, '') // zero-width chars / BOM
    .replace(/[ \t]+\n/g, '\n')          // trailing whitespace on lines
    .replace(/\n{4,}/g, '\n\n\n')        // collapse 4+ blank lines to 3
    .trim();
}

// Heuristic: if the extracted text is suspiciously short relative to the PDF
// size, the source is most likely an image-based scan (recruiter forwards a
// photo of a transcript) and pdf-parse couldn't extract anything useful.
// Throws a typed error so the worker can surface a clear message to the UI.
export function assertExtractedTextPlausible(text: string, byteSize: number, source: string): void {
  if (text.length < 100 && byteSize > 50_000) {
    throw new Error(
      `PDF_IMAGE_ONLY: ${source} appears to be a scanned image (extracted ${text.length} chars from ${byteSize} bytes) — please upload a text-based PDF or paste the transcript directly`,
    );
  }
}
