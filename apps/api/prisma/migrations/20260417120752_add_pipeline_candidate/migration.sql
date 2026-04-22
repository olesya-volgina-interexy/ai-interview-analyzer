-- CreateTable
CREATE TABLE "PipelineCandidate" (
    "id" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "rootCommentId" TEXT NOT NULL,
    "candidateName" TEXT,
    "level" TEXT,
    "cvUrl" TEXT NOT NULL,
    "cvText" TEXT,
    "role" TEXT,
    "clientName" TEXT,
    "cvSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineCandidate_rootCommentId_key" ON "PipelineCandidate"("rootCommentId");

-- CreateIndex
CREATE INDEX "PipelineCandidate_linearIssueId_idx" ON "PipelineCandidate"("linearIssueId");

-- CreateIndex
CREATE INDEX "PipelineCandidate_cvSubmittedAt_idx" ON "PipelineCandidate"("cvSubmittedAt");
