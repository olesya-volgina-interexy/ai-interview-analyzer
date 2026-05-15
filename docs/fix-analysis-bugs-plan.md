# Plan: Fix Analysis Bugs

Branch: `fix/analysis-bugs-plan` → merge into `main`

---

## Bug 1 — brokerMatchScore = 0% on prod (works correctly on dev)

### Root cause (primary)

`getIssueData()` in `linear.service.ts` fetches only `description` as the broker request:

```typescript
brokerRequest: issueData.description,
```

On prod, the Linear issue `description` is likely **null or empty** — broker requirements may be stored as a first comment, in a custom field, or just never filled in the description. As a result, `buildUserMessage()` sends `"Broker request not provided"` to the LLM, which correctly puts everything in `notAssessedRequirements`. By the formula:

```
brokerMatchScore = coveredRequirements / (covered + missing) × 100
nothing tested → 0
```

The score is correctly 0 — but for the wrong reason (missing data, not missing match).

### Root cause (secondary)

Even when `brokerRequest` IS provided but the interview itself didn't explicitly test any broker requirements (common in screening calls), the formula always returns 0. The user expects at least a partial proxy score based on confirmed CV skills overlapping with the broker list.

### Fix plan

**Step 1 — Debug logging** in `analyze.worker.ts` (no behavior change):
- Log the final resolved `brokerRequest` value before it reaches `buildUserMessage`
- Log whether it came from `job.data.brokerRequest`, `additionalContext`, or `meta.brokerRequest`

**Step 2 — Fallback proxy score in the prompt** (`analyze.prompt.ts`):
- Extend the scoring rules section to instruct the LLM: when `coveredRequirements` and `missingRequirements` are both empty, calculate `brokerMatchScore` as:
  ```
  confirmedSkills ∩ requiredSkills / requiredSkills × 100
  ```
  Store the real formula result in `brokerMatchScore` and the proxy in a new field `brokerProxyScore` (so they're distinguishable in the UI).
- Update `BrokerRequestMatchSchema` in `packages/shared/src/schemas.ts` to add optional `brokerProxyScore: z.number().min(0).max(100).optional()`

**Step 3 — Enrich broker request from Linear** (`linear.service.ts` + `linear.parser.ts`):
- In `getIssueData()`, try fetching the issue's first body comment as a fallback if `description` is null. Many teams post requirements as a pinned/first comment.
- Alternatively, expose a new GraphQL query that fetches custom field values alongside description (if the team uses Linear's "Estimates" or custom fields for broker requirements).

**Step 4 — UI change** (`BrokerMatchBlock.tsx`):
- When `brokerMatchScore === 0` AND `notAssessedRequirements.length > 0` AND `brokerProxyScore !== undefined`, show: `"Not tested in interview — proxy: N%"` instead of `"0%"` in red

Files to change:
- `apps/api/src/services/linear.service.ts` — `getIssueData()`
- `apps/api/src/services/linear.parser.ts` — `parseIssue()` fallback
- `apps/api/src/workers/analyze.worker.ts` — debug logging
- `apps/api/src/prompts/analyze.prompt.ts` — proxy score instruction + updated schema comment
- `packages/shared/src/schemas.ts` — `BrokerRequestMatchSchema`
- `apps/web/src/components/analysis/BrokerMatchBlock.tsx` — proxy score display

---

## Bug 2 — PDF transcript parsing crashes on `\n` or null

### Root cause

`pdf-parse` extracts raw text from PDFs. Certain PDF files (Zoom, Fireflies, Otter.ai exports, etc.) produce text with:

1. **Literal `\n` sequences** — the text string contains backslash + n as two characters, not an actual newline. This happens with some PDF generators that store newlines as escaped strings.
2. **Null bytes (`\0`)** — some PDFs embed null bytes in text layers, which break subsequent string operations and JSON serialization.
3. **Empty text on some pages** — `pdf-parse` returns an empty string for image-only pages or corrupt page data; if the whole transcript is image-based, `!text` throws `"PDF transcript is empty"`.
4. **`pdfParse` itself throws** on malformed PDFs (truncated xref tables, encrypted PDFs, etc.) — the error propagates up uncaught in `fetchPdfTranscript` and kills the whole worker job.

### Fix plan

**Step 1 — Normalize extracted PDF text** — add a shared `sanitizePdfText(raw: string): string` utility in `apps/api/src/utils/pdfUtils.ts`:
```typescript
export function sanitizePdfText(raw: string): string {
  return raw
    .replace(/\0/g, '')           // remove null bytes
    .replace(/\\n/g, '\n')        // literal \n → real newline
    .replace(/\\t/g, '\t')        // literal \t → real tab
    .replace(/\r\n/g, '\n')       // normalize CRLF
    .replace(/\r/g, '\n')         // normalize CR-only
    .replace(/\n{4,}/g, '\n\n\n') // collapse 4+ blank lines to 3
    .trim();
}
```

**Step 2 — Apply `sanitizePdfText` in both PDF-parsing paths**:
- `bluedot.service.ts` → `fetchPdfTranscript()`: apply after `parsed.text`
- `cv.service.ts` → `fetchPdfContent()` and `fetchGenericWebContent()` (pdf branch): apply after `parsed.text`
- `routes/upload.ts` → `pdfParse` branch: apply after `parsed.text`

**Step 3 — Graceful fallback in `fetchPdfTranscript`**:
- Wrap `pdfParse(buffer)` in a `try/catch`. On failure, log the error and throw a typed error:
  ```
  throw new Error(`PDF_PARSE_FAILED: ${url} — ${err.message}`)
  ```
  This keeps the worker job failure message meaningful instead of an unhandled exception.
- In `analyze.worker.ts`, catch `PDF_PARSE_FAILED` errors specifically so the job fails with a clear error message that shows in the UI ("Failed to extract text from transcript PDF").

**Step 4 — OCR/image-PDF detection**:
- If extracted text length < 100 chars on a PDF > 50 KB, it's likely an image-based PDF. Add a specific error:
  ```
  throw new Error(`PDF_IMAGE_ONLY: transcript appears to be a scanned image — please upload a text-based PDF or paste transcript directly`)
  ```
- Surface this error message in the frontend poll result.

Files to change:
- `apps/api/src/utils/pdfUtils.ts` — new file with `sanitizePdfText`
- `apps/api/src/services/bluedot.service.ts` — import and apply `sanitizePdfText`, improve error handling
- `apps/api/src/services/cv.service.ts` — import and apply `sanitizePdfText`
- `apps/api/src/routes/upload.ts` — import and apply `sanitizePdfText`

---

## Bug 3 — CV only partially shown in the analysis modal

### Root cause

There are two distinct sub-issues:

**Sub-issue A — CV extracted via URL is capped at 7,000 chars**

`cv.service.ts` has `CV_MAX_CHARS = 7_000`. For a typical resume PDF (3-4 pages), this can truncate up to 30–40% of the content. The truncated portion is never sent to the LLM, never stored in the DB, and never shown in the modal.

```typescript
const CV_MAX_CHARS = 7_000;  // ← too small for modern multi-page CVs
```

**Sub-issue B — CV tab in `CandidateModal` is visually limited but complete**

The CV tab uses `max-h-96 overflow-y-auto`. The full `data.cvText` is rendered — it just requires scrolling. This is a UX issue: users may not notice the scrollbar and think the content is truncated.

For uploaded files via `AnalyzeForm`: the `/upload` endpoint applies `MAX_TEXT_CHARS = 100_000` — plenty of space. So uploaded CV files are NOT truncated for the LLM.

For URL-based CV extraction (Linear webhook flow): the 7,000 char limit IS a real truncation that affects analysis quality.

**Does this affect analysis?**
- YES for URL-based CVs (Linear flow): the LLM receives a truncated resume — skills listed later in the document are invisible
- NO for uploaded files: full text (up to 100k) is sent

### Fix plan

**Step 1 — Increase `CV_MAX_CHARS` in `cv.service.ts`**:
- Change `CV_MAX_CHARS` from `7_000` to `20_000` (≈ 10 pages). This covers virtually all real-world resumes.
- Also apply `sanitizePdfText` (from Bug 2 fix) inside `fetchPdfContent` to ensure clean text.

**Step 2 — Add a scroll hint to the CV tab in `CandidateModal.tsx`**:
- When `data.cvText.length > 2000`, show a small label above the `<pre>` block: `"Scroll to see full CV"` or indicate line count.
- Or replace `max-h-96` with `max-h-[500px]` and add a "Show full CV" expand button.

**Step 3 — Store `cvCharCount` in analysis metadata** (optional, for debugging):
- When saving an interview, store the character count of the CV text that was actually sent to the LLM. This makes it visible in the modal if the CV was truncated.

Files to change:
- `apps/api/src/services/cv.service.ts` — increase `CV_MAX_CHARS`, apply `sanitizePdfText`
- `apps/web/src/components/modals/CandidateModal.tsx` — scroll hint / expand button on CV tab

---

## Implementation order

1. **Bug 2 first** — create `pdfUtils.ts`, apply `sanitizePdfText` everywhere. This is self-contained and unblocks reliable transcript/CV ingestion.
2. **Bug 3 (step 1)** — increase `CV_MAX_CHARS` while `cv.service.ts` is open from the Bug 2 fix. Single-line change.
3. **Bug 1** — add debug logging first (deploy to prod, observe actual `brokerRequest` value in logs), then add proxy score and Linear description fallback.
4. **UI improvements** — Bug 3 (step 2) and Bug 1 (step 4) after backend changes are validated.

---

## Open questions before implementation

1. **Bug 1**: On prod, check server logs to confirm whether `brokerRequest` arrives as `null`/empty in the worker. This determines whether Step 2 (proxy score) or Step 3 (Linear enrichment) is the right fix.
2. **Bug 2**: Share an example of a PDF that fails to parse so the exact failure mode can be confirmed before writing the sanitizer.
3. **Bug 1 model difference**: Are `LLM_MODEL` and `EMBEDDING_MODEL` env vars identical between prod and dev? A different model can produce systematically different scoring behavior.
