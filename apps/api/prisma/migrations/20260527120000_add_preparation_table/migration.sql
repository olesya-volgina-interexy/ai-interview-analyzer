-- CreateTable
CREATE TABLE "Preparation" (
    "id" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "linearIssueId" TEXT NOT NULL,
    "linearIssueTitle" TEXT NOT NULL,
    "preparationDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preparation_candidateName_idx" ON "Preparation"("candidateName");

-- CreateIndex
CREATE INDEX "Preparation_linearIssueId_idx" ON "Preparation"("linearIssueId");

-- CreateIndex
CREATE INDEX "Preparation_preparationDate_idx" ON "Preparation"("preparationDate");
