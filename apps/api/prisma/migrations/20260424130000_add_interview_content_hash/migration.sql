-- Add contentHash to enable content-level dedup (catches identical transcripts
-- posted under different parentCommentIds). Nullable — existing rows stay untouched.
ALTER TABLE "Interview" ADD COLUMN "contentHash" TEXT;

-- Lookup index used by the worker before calling the LLM.
CREATE INDEX "Interview_linearIssueId_stage_contentHash_idx"
  ON "Interview"("linearIssueId", "stage", "contentHash");
