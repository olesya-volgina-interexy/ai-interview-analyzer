-- CreateTable
CREATE TABLE "IncomingRequest" (
    "id" TEXT NOT NULL,
    "linearIssueId" TEXT,
    "clientName" TEXT,
    "role" TEXT,
    "level" TEXT,
    "brokerRequest" TEXT,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingRequest_linearIssueId_key" ON "IncomingRequest"("linearIssueId");

-- CreateIndex
CREATE INDEX "IncomingRequest_receivedAt_status_idx" ON "IncomingRequest"("receivedAt", "status");
