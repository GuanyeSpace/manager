-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "actualControllerId" TEXT,
ADD COLUMN     "actualControllerName" TEXT,
ADD COLUMN     "loginUserId" TEXT,
ADD COLUMN     "loginUserName" TEXT,
ADD COLUMN     "shiftId" TEXT;

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "branchId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "checks" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkShift_userId_startedAt_idx" ON "WorkShift"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkShift_branchId_idx" ON "WorkShift"("branchId");

-- CreateIndex
CREATE INDEX "WorkSession_shiftId_idx" ON "WorkSession"("shiftId");

-- CreateIndex
CREATE INDEX "WorkSession_loginUserId_phase_idx" ON "WorkSession"("loginUserId", "phase");

-- CreateIndex
CREATE INDEX "WorkSession_actualControllerId_phase_idx" ON "WorkSession"("actualControllerId", "phase");

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 同一登录账号仅一条未结束上班记录；旧场次仍以原中控兜底。
CREATE UNIQUE INDEX "WorkShift_open_user_key" ON "WorkShift"("userId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "WorkSession_live_login_key" ON "WorkSession"(COALESCE("loginUserId", "controllerId")) WHERE "phase" = 'LIVE';
CREATE UNIQUE INDEX "WorkSession_live_actual_key" ON "WorkSession"(COALESCE("actualControllerId", "controllerId")) WHERE "phase" = 'LIVE';
