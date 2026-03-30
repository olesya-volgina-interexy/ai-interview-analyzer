-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "cvText" TEXT,
    "brokerRequest" TEXT,
    "role" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "clientName" TEXT,
    "candidateName" TEXT,
    "comments" TEXT,
    "krisLink" TEXT,
    "cvUrl" TEXT,
    "linearIssueId" TEXT,
    "analysis" JSONB NOT NULL,
    "embeddingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "insights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
