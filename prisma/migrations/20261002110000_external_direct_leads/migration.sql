-- AlterTable
ALTER TABLE "DouyinAccount" ADD COLUMN     "externalAnchorId" TEXT;

-- AlterTable
ALTER TABLE "AccountRecord" ADD COLUMN     "externalAnchorId" TEXT,
ADD COLUMN     "externalAnchorName" TEXT;

-- AlterTable
ALTER TABLE "LiveReport" ADD COLUMN     "directTaskId" TEXT,
ADD COLUMN     "externalAnchorId" TEXT;

-- AlterTable
ALTER TABLE "ConfirmedLead" ADD COLUMN     "externalAnchorId" TEXT,
ALTER COLUMN "anchorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ExternalAnchor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectLeadTask" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "externalAnchorId" TEXT NOT NULL,
    "anchorName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectLeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalAnchor_branchId_active_idx" ON "ExternalAnchor"("branchId", "active");

-- CreateIndex
CREATE INDEX "DirectLeadTask_accountId_startedAt_idx" ON "DirectLeadTask"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "DirectLeadTask_branchId_createdAt_idx" ON "DirectLeadTask"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectLeadTask_userId_completedAt_idx" ON "DirectLeadTask"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReport_directTaskId_key" ON "LiveReport"("directTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmedLead_day_externalAnchorId_backendId_key" ON "ConfirmedLead"("day", "externalAnchorId", "backendId");

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_externalAnchorId_fkey" FOREIGN KEY ("externalAnchorId") REFERENCES "ExternalAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_externalAnchorId_fkey" FOREIGN KEY ("externalAnchorId") REFERENCES "ExternalAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_directTaskId_fkey" FOREIGN KEY ("directTaskId") REFERENCES "DirectLeadTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_externalAnchorId_fkey" FOREIGN KEY ("externalAnchorId") REFERENCES "ExternalAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedLead" ADD CONSTRAINT "ConfirmedLead_externalAnchorId_fkey" FOREIGN KEY ("externalAnchorId") REFERENCES "ExternalAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAnchor" ADD CONSTRAINT "ExternalAnchor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectLeadTask" ADD CONSTRAINT "DirectLeadTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectLeadTask" ADD CONSTRAINT "DirectLeadTask_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "AccountRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectLeadTask" ADD CONSTRAINT "DirectLeadTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectLeadTask" ADD CONSTRAINT "DirectLeadTask_externalAnchorId_fkey" FOREIGN KEY ("externalAnchorId") REFERENCES "ExternalAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectLeadTask" ADD CONSTRAINT "DirectLeadTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 当前账号最多一种主播；确定数据必须且只能关联一种主播。
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_anchor_kind_check" CHECK ("anchorId" IS NULL OR "externalAnchorId" IS NULL);
ALTER TABLE "ConfirmedLead" ADD CONSTRAINT "ConfirmedLead_anchor_kind_check" CHECK (("anchorId" IS NULL) <> ("externalAnchorId" IS NULL));
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_source_kind_check" CHECK ("workSessionId" IS NULL OR "directTaskId" IS NULL);
