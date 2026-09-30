-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_UPDATE';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "DouyinAccount" (
    "id" TEXT NOT NULL,
    "douyinId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "operatorId" TEXT,
    "controllerId" TEXT NOT NULL,
    "anchorId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DouyinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "douyinId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "controllerId" TEXT NOT NULL,
    "controllerName" TEXT NOT NULL,
    "anchorId" TEXT,
    "anchorName" TEXT,
    "actorName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AccountRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DouyinAccount_douyinId_key" ON "DouyinAccount"("douyinId");

-- CreateIndex
CREATE INDEX "DouyinAccount_branchId_idx" ON "DouyinAccount"("branchId");

-- CreateIndex
CREATE INDEX "DouyinAccount_operatorId_idx" ON "DouyinAccount"("operatorId");

-- CreateIndex
CREATE INDEX "DouyinAccount_controllerId_idx" ON "DouyinAccount"("controllerId");

-- CreateIndex
CREATE INDEX "DouyinAccount_anchorId_idx" ON "DouyinAccount"("anchorId");

-- CreateIndex
CREATE INDEX "AccountRecord_branchId_idx" ON "AccountRecord"("branchId");

-- CreateIndex
CREATE INDEX "AccountRecord_operatorId_idx" ON "AccountRecord"("operatorId");

-- CreateIndex
CREATE INDEX "AccountRecord_controllerId_idx" ON "AccountRecord"("controllerId");

-- CreateIndex
CREATE INDEX "AccountRecord_anchorId_idx" ON "AccountRecord"("anchorId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountRecord_accountId_version_key" ON "AccountRecord"("accountId", "version");

-- CreateIndex
CREATE INDEX "Branch_managerId_idx" ON "Branch"("managerId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
