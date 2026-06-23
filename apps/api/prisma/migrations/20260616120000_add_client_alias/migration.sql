-- CreateTable
CREATE TABLE "ClientAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAlias_alias_key" ON "ClientAlias"("alias");

-- CreateIndex
CREATE INDEX "ClientAlias_canonicalName_idx" ON "ClientAlias"("canonicalName");
