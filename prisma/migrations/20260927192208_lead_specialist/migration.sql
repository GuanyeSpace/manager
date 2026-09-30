-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LEAD_SPECIALIST';

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "leadEligible" BOOLEAN NOT NULL DEFAULT false;

-- 旧场次不进入认领池，发布后新建场次默认启用。
ALTER TABLE "WorkSession" ALTER COLUMN "leadEligible" SET DEFAULT true;

-- CreateTable
CREATE TABLE "LeadTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadTask_sessionId_key" ON "LeadTask"("sessionId");

-- CreateIndex
CREATE INDEX "LeadTask_branchId_createdAt_idx" ON "LeadTask"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadTask_userId_completedAt_idx" ON "LeadTask"("userId", "completedAt");

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
