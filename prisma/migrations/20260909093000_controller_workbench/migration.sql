-- CreateEnum
CREATE TYPE "WorkPhase" AS ENUM ('PREPARING', 'LIVE', 'WRAP', 'COMPLETE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'WORKFLOW_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'WORK_SESSION_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'DAILY_WORK_UPDATE';

-- AlterTable
ALTER TABLE "LiveReport" ADD COLUMN     "workSessionId" TEXT;

-- CreateTable
CREATE TABLE "AccountWorkflow" (
    "accountId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountWorkflow_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phase" "WorkPhase" NOT NULL DEFAULT 'PREPARING',
    "workflow" JSONB NOT NULL,
    "workflowVersion" INTEGER NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSession_accountId_createdAt_idx" ON "WorkSession"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkSession_controllerId_phase_idx" ON "WorkSession"("controllerId", "phase");

-- CreateIndex
CREATE INDEX "WorkEvent_sessionId_createdAt_idx" ON "WorkEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWork_userId_day_key" ON "DailyWork"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LiveReport_workSessionId_key" ON "LiveReport"("workSessionId");

-- AddForeignKey
ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountWorkflow" ADD CONSTRAINT "AccountWorkflow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "AccountRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 一个账号仅保留一场准备/直播中的场次；一个中控不能同时直播。
CREATE UNIQUE INDEX "WorkSession_active_account_key" ON "WorkSession"("accountId") WHERE "phase" IN ('PREPARING', 'LIVE');
CREATE UNIQUE INDEX "WorkSession_live_controller_key" ON "WorkSession"("controllerId") WHERE "phase" = 'LIVE';
