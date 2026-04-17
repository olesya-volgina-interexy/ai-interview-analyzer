-- CreateTable
CREATE TABLE "IncomingRequestStatusHistory" (
    "id" TEXT NOT NULL,
    "incomingRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingRequestStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingRequestStatusHistory_incomingRequestId_enteredAt_idx" ON "IncomingRequestStatusHistory"("incomingRequestId", "enteredAt");

-- AddForeignKey
ALTER TABLE "IncomingRequestStatusHistory" ADD CONSTRAINT "IncomingRequestStatusHistory_incomingRequestId_fkey" FOREIGN KEY ("incomingRequestId") REFERENCES "IncomingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
