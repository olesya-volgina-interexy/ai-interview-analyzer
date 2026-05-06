-- CreateTable
CREATE TABLE "PreparationDoc" (
    "id" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "brokerRequest" TEXT,
    "markdown" TEXT NOT NULL,
    "sourceInterviewIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationDoc_pkey" PRIMARY KEY ("id")
);
