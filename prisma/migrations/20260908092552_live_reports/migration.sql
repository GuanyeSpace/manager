-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LIVE_REPORT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'LIVE_REPORT_UPDATE';

-- CreateTable
CREATE TABLE "LiveReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "douyinId" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "controllerName" TEXT NOT NULL,
    "operatorId" TEXT,
    "anchorId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "sessionLabel" TEXT NOT NULL,
    "exposureCount" INTEGER NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "averageOnline" INTEGER NOT NULL,
    "peakOnline" INTEGER NOT NULL,
    "averageStayHundredths" INTEGER NOT NULL,
    "commenterCount" INTEGER NOT NULL,
    "likeCount" INTEGER NOT NULL,
    "newFollowers" INTEGER NOT NULL,
    "shareCount" INTEGER NOT NULL,
    "newFanClubMembers" INTEGER NOT NULL,
    "historicalBackfill" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveReport_branchId_startedAt_idx" ON "LiveReport"("branchId", "startedAt");

-- CreateIndex
CREATE INDEX "LiveReport_controllerId_idx" ON "LiveReport"("controllerId");

-- CreateIndex
CREATE INDEX "LiveReport_operatorId_idx" ON "LiveReport"("operatorId");

-- CreateIndex
CREATE INDEX "LiveReport_anchorId_idx" ON "LiveReport"("anchorId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReport_accountId_startedAt_key" ON "LiveReport"("accountId", "startedAt");

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "AccountRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
