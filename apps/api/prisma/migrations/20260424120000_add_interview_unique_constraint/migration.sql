-- Deduplicate before adding the unique constraint: keep the oldest row per
-- (linearIssueId, parentCommentId, stage) triple. Only rows where both
-- linearIssueId and parentCommentId are non-null can collide; Postgres treats
-- NULLs as distinct in unique indexes, so rows with null keys are untouched.
DELETE FROM "Interview" a
USING "Interview" b
WHERE a."linearIssueId" IS NOT NULL
  AND a."parentCommentId" IS NOT NULL
  AND a."linearIssueId" = b."linearIssueId"
  AND a."parentCommentId" = b."parentCommentId"
  AND a."stage" = b."stage"
  AND (
    a."createdAt" > b."createdAt"
    OR (a."createdAt" = b."createdAt" AND a."id" > b."id")
  );

-- Replace the plain composite index with a unique one.
DROP INDEX IF EXISTS "Interview_linearIssueId_parentCommentId_stage_idx";

CREATE UNIQUE INDEX "Interview_linearIssueId_parentCommentId_stage_key"
  ON "Interview"("linearIssueId", "parentCommentId", "stage");
