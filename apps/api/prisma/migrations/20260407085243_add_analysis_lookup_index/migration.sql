-- CreateIndex
CREATE INDEX "Interview_linearIssueId_parentCommentId_stage_idx" ON "Interview"("linearIssueId", "parentCommentId", "stage");
