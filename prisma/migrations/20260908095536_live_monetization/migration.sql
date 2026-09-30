-- AlterTable
ALTER TABLE "LiveReport" ADD COLUMN     "backendJoinCount" INTEGER,
ADD COLUMN     "effectiveCount" INTEGER,
ADD COLUMN     "fanGroupCount" INTEGER,
ADD COLUMN     "hasSales" BOOLEAN,
ADD COLUMN     "linkClickCount" INTEGER,
ADD COLUMN     "longPressCount" INTEGER,
ADD COLUMN     "monetizationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "monetizationUpdatedBy" TEXT,
ADD COLUMN     "salesGmv" DECIMAL(14,2);
