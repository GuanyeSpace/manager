-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "hasIncident" BOOLEAN,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "wrapNote" TEXT;

-- CreateTable
CREATE TABLE "WorkScreenshot" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkScreenshot_sessionId_createdAt_idx" ON "WorkScreenshot"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkScreenshot_eventId_idx" ON "WorkScreenshot"("eventId");

-- CreateIndex
CREATE INDEX "WorkScreenshot_branchId_idx" ON "WorkScreenshot"("branchId");

-- AddForeignKey
ALTER TABLE "WorkScreenshot" ADD CONSTRAINT "WorkScreenshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScreenshot" ADD CONSTRAINT "WorkScreenshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WorkEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
