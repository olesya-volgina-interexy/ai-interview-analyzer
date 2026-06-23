-- CreateTable
CREATE TABLE "CvConsistencyAlert" (
    "id" TEXT NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "newRootCommentId" TEXT NOT NULL,
    "priorRootCommentId" TEXT NOT NULL,
    "pairHash" TEXT NOT NULL,
    "discrepancy" INTEGER NOT NULL,
    "samePerson" BOOLEAN NOT NULL,
    "reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvConsistencyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CvConsistencyAlert_pairHash_key" ON "CvConsistencyAlert"("pairHash");

-- CreateIndex
CREATE INDEX "CvConsistencyAlert_candidateKey_idx" ON "CvConsistencyAlert"("candidateKey");
