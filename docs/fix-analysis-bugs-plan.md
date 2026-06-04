# Plan: Fix Analysis Bugs

Branch: `fix/analysis-bugs-plan` → merge into `main`

---

## Bug 1 — brokerMatchScore = 0% on prod (works correctly on dev)

### Confirmed facts

- The `brokerRequest` field **was received by the LLM** and **populated in the analysis modal** — so data transfer is not the problem.
- The LLM correctly parsed the broker requirements into `requiredSkills`.
- Despite this, `brokerMatchScore = 0%`.

### Root cause

The LLM classified **all broker requirements as `notAssessedRequirements`** — it found no requirements that were explicitly tested AND passed/failed in the interview. By the scoring formula in `analyze.prompt.ts`:

```
brokerMatchScore = coveredRequirements.length / (coveredRequirements.length + missingRequirements.length) × 100
If nothing was tested → use 0.
```

With `coveredRequirements = []` and `missingRequirements = []`, the denominator is 0 → result is 0. This is mathematically correct per the rule but **uninformative** — the user sees 0% as if nothing matched, when in reality nothing was just *explicitly tested* in the interview.

### Why dev worked but prod didn't

Confirmed: same LLM model, same data, no errors, no previous analyses (Qdrant empty on both). All environmental differences are ruled out.

**Root cause: LLM non-determinism at `temperature: 0.1`**

`llm.service.ts` sets `temperature: 0.1`. This is low but not zero — the model can produce different outputs for the same input between runs. The broker requirement classification is a judgment call: _"did the interview explicitly test this requirement?"_ For borderline cases (candidate mentions a technology while answering a related but differently-phrased question), one run classifies it as `coveredRequirements`, another run classifies it as `notAssessedRequirements`.

The prompt rule in `analyze.prompt.ts` is extremely strict:
> "a broker requirement is 'covered' ONLY if an explicit question was asked AND the candidate demonstrated it in their answer"

This strictness, combined with temperature randomness, means results for the same interview can flip between runs depending on how the model interprets "explicit question". On dev the model happened to count some answers as covering requirements; on prod the same model, same data, didn't.

**Secondary contributor: the `notAssessedRequirements` bucket is a dead end in the formula**

Even when the candidate clearly demonstrated skills that match the broker list (just not via a direct question about each one), the formula gives `0 / 0 = 0`. There is no fallback signal.

### Fix plan

**Step 1 — Set `temperature: 0` in `llm.service.ts`**

Change `temperature: 0.1` → `temperature: 0` for `analyzeInterview`. This makes classification deterministic — same input always produces the same output. No schema or prompt changes needed.

File: `apps/api/src/services/llm.service.ts`

**Step 2 — Loosen the broker requirement rule in the prompt** (`analyze.prompt.ts`)

The current rule requires "a direct question about this exact requirement by name". Add a nuance: if the candidate answered a question whose topic demonstrably covers a broker requirement (e.g. interviewer asks "tell me about your experience with microservices" and broker requires "microservices experience"), it counts as `coveredRequirements`. The match is by topic, not by exact phrasing.

This prevents the model from putting everything in `notAssessedRequirements` just because the interviewer didn't phrase a question as "do you know X?".

File: `apps/api/src/prompts/analyze.prompt.ts` — update Rule 6 (BROKER REQUIREMENTS CLASSIFICATION)

**Step 3 — Add `brokerProxyScore` as a fallback signal** (`analyze.prompt.ts` + `schemas.ts`)

For cases where the interview genuinely didn't touch broker requirements at all, add a second computed field — `brokerProxyScore` — calculated purely from confirmed CV skills overlap with required skills:

```
brokerProxyScore = |confirmedSkills ∩ requiredSkills| / requiredSkills.length × 100
```

- `brokerMatchScore` remains the interview-based score (honest: 0 if nothing was tested)
- `brokerProxyScore` is the CV-based estimate: "given what this candidate knows, how well do they likely match?"
- Add `brokerProxyScore: z.number().min(0).max(100).optional()` to `BrokerRequestMatchSchema`

Files: `apps/api/src/prompts/analyze.prompt.ts`, `packages/shared/src/schemas.ts`

**Step 4 — Update UI** (`BrokerMatchBlock.tsx`)

- `brokerMatchScore > 0`: show as-is (interview-verified match)
- `brokerMatchScore === 0` + `notAssessedRequirements.length > 0` + `brokerProxyScore` defined:
  Show `"Not tested in interview"` in neutral grey, with secondary badge `"CV estimate: N%"` in amber
- `brokerMatchScore === 0` + `notAssessedRequirements` empty:
  Keep red — nothing was matched and nothing was missed (genuine problem)

File: `apps/web/src/components/analysis/BrokerMatchBlock.tsx`

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

1. **Bug 2** — create `pdfUtils.ts`, apply `sanitizePdfText` everywhere. Self-contained, unblocks reliable PDF ingestion.
2. **Bug 3 (step 1)** — increase `CV_MAX_CHARS` while `cv.service.ts` is open. Single-line change.
3. **Bug 1, step 1** — set `temperature: 0`. One-line change, immediate effect on determinism.
4. **Bug 1, step 2** — loosen broker prompt rule.
5. **Bug 1, step 3+4** — add `brokerProxyScore` to prompt + schema + UI.
6. **Bug 3 (step 2)** — CandidateModal scroll hint.

---

## Open questions before implementation

1. **Bug 2**: Share an example PDF that fails to parse — confirms whether the issue is literal `\n`, null bytes, or something else before writing the sanitizer.
2. **Bug 3**: Is the CV displayed in the modal via URL fetch (Linear flow) or via file upload? This determines whether the 7,000 char limit is the actual source of truncation the user sees.
