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

Two likely causes (verify before implementing):

**Cause A — Different LLM model on prod vs dev** (`LLM_MODEL` env var).
A stricter model follows the "explicitly tested with a direct question" rule more literally and puts more requirements into `notAssessedRequirements`. A more lenient model counts a candidate *mentioning* a technology as evidence of testing.

**Cause B — `meta.decision` was set on dev but not on prod.**
When `meta.decision` is provided (`hired`/`rejected`), the prompt switches to **DECISION JUSTIFICATION** mode (lines 209–228 of `analyze.prompt.ts`). In this mode the LLM is instructed to "find concrete technical strengths that justify the hire decision" — which naturally pushes it to classify more skills as `coveredRequirements`. Without a decision, it applies independent strict rules, leading to more `notAssessedRequirements`.

Check: did the dev analysis have `meta.decision` set, and prod did not?

### Fix plan

**Step 1 — Check env vars first** (no code change):
- Compare `LLM_MODEL` on prod and dev — if different, test the prod model with the same data on dev first.

**Step 2 — Add proxy score to the prompt and schema** (`analyze.prompt.ts` + `schemas.ts`):
When `coveredRequirements` and `missingRequirements` are both empty, instruct the LLM to compute a secondary signal — `brokerProxyScore` — based on overlap between `confirmedSkills` (things tested in the interview) and `requiredSkills` (broker list):
```
brokerProxyScore = confirmedSkills ∩ requiredSkills / requiredSkills × 100
```
- `brokerMatchScore` stays 0 (honest: nothing was explicitly tested from the broker list)
- `brokerProxyScore` gives a useful "likely match" signal based on what was tested
- Add `brokerProxyScore: z.number().min(0).max(100).optional()` to `BrokerRequestMatchSchema`

**Step 3 — Adjust prompt instruction for INDEPENDENT ASSESSMENT mode** (`analyze.prompt.ts`):
In the independent assessment section, add a nuance: if the candidate demonstrably answered a question that covers a broker requirement (even if the question wasn't phrased as "do you know X") — it counts as `coveredRequirements`. Currently the instruction may be too strict about requiring a direct question about the exact requirement name.

**Step 4 — UI change** (`BrokerMatchBlock.tsx`):
- When `brokerMatchScore === 0` AND `notAssessedRequirements` has items AND `brokerProxyScore` is defined:
  Show `"0% tested in interview"` in a neutral color (not alarming red) with a secondary line: `"Likely match based on confirmed skills: N%"`
- When `brokerMatchScore === 0` AND `notAssessedRequirements` is empty:
  Keep red — nothing was matched and nothing was untested (genuine 0).

Files to change:
- `apps/api/src/prompts/analyze.prompt.ts` — proxy score instruction, loosen independent assessment broker rule
- `packages/shared/src/schemas.ts` — add `brokerProxyScore` to `BrokerRequestMatchSchema`
- `apps/web/src/components/analysis/BrokerMatchBlock.tsx` — display proxy score, change color logic

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

1. **Bug 1 — investigation first**: confirm Cause A or B (check `LLM_MODEL` env var, check if `meta.decision` was set on dev analysis). No code yet.
2. **Bug 2** — create `pdfUtils.ts`, apply `sanitizePdfText` everywhere. Self-contained, unblocks reliable PDF ingestion.
3. **Bug 3 (step 1)** — increase `CV_MAX_CHARS` while `cv.service.ts` is open from the Bug 2 fix. Single-line change.
4. **Bug 1 — code**: add proxy score to prompt + schema + UI display.
5. **Bug 1 — prompt tweak** (if needed): loosen the independent assessment broker rule after observing results.
6. **UI improvements** — Bug 3 (step 2) CandidateModal scroll hint.

---

## Open questions before implementation

1. **Bug 1 — model**: Is `LLM_MODEL` the same on prod and dev? If different, this is the root cause — test prod model on dev with the same data first.
2. **Bug 1 — decision field**: Did the dev analysis have `meta.decision = 'hired'` or `'rejected'` set, and did prod NOT have it set? This switches the LLM into a different scoring mode.
3. **Bug 2**: Share an example PDF that fails to parse — this will confirm whether the issue is literal `\n`, null bytes, or something else before writing the sanitizer.
