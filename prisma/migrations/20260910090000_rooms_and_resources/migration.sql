-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('PHONE', 'EQUIPMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'RESOURCE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'RESOURCE_UPDATE';

-- AlterTable
ALTER TABLE "DouyinAccount" ADD COLUMN     "phoneNumberId" TEXT,
ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "LiveRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "operatorId" TEXT,
    "controllerId" TEXT,
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAnchor" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "RoomAnchor_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL DEFAULT '',
    "wechat" TEXT NOT NULL DEFAULT '',
    "carrier" TEXT NOT NULL DEFAULT '',
    "plan" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "branchId" TEXT NOT NULL,
    "roomId" TEXT,
    "operatorId" TEXT,
    "controllerId" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDevice" (
    "id" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "code" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "branchId" TEXT NOT NULL,
    "roomId" TEXT,
    "operatorId" TEXT,
    "controllerId" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSlot" (
    "deviceId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "DeviceSlot_pkey" PRIMARY KEY ("deviceId","slot")
);

-- CreateIndex
CREATE INDEX "LiveRoom_operatorId_idx" ON "LiveRoom"("operatorId");

-- CreateIndex
CREATE INDEX "LiveRoom_controllerId_idx" ON "LiveRoom"("controllerId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoom_branchId_name_key" ON "LiveRoom"("branchId", "name");

-- CreateIndex
CREATE INDEX "RoomAnchor_userId_idx" ON "RoomAnchor"("userId");

-- CreateIndex
CREATE INDEX "RoomAnchor_branchId_idx" ON "RoomAnchor"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_number_key" ON "PhoneNumber"("number");

-- CreateIndex
CREATE INDEX "PhoneNumber_branchId_idx" ON "PhoneNumber"("branchId");

-- CreateIndex
CREATE INDEX "PhoneNumber_roomId_idx" ON "PhoneNumber"("roomId");

-- CreateIndex
CREATE INDEX "PhoneNumber_operatorId_idx" ON "PhoneNumber"("operatorId");

-- CreateIndex
CREATE INDEX "PhoneNumber_controllerId_idx" ON "PhoneNumber"("controllerId");

-- CreateIndex
CREATE INDEX "PhoneNumber_userId_idx" ON "PhoneNumber"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDevice_code_key" ON "AssetDevice"("code");

-- CreateIndex
CREATE INDEX "AssetDevice_branchId_kind_idx" ON "AssetDevice"("branchId", "kind");

-- CreateIndex
CREATE INDEX "AssetDevice_roomId_idx" ON "AssetDevice"("roomId");

-- CreateIndex
CREATE INDEX "AssetDevice_operatorId_idx" ON "AssetDevice"("operatorId");

-- CreateIndex
CREATE INDEX "AssetDevice_controllerId_idx" ON "AssetDevice"("controllerId");

-- CreateIndex
CREATE INDEX "AssetDevice_userId_idx" ON "AssetDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSlot_phoneNumberId_key" ON "DeviceSlot"("phoneNumberId");

-- CreateIndex
CREATE INDEX "DeviceSlot_branchId_idx" ON "DeviceSlot"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DouyinAccount_phoneNumberId_key" ON "DouyinAccount"("phoneNumberId");

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnchor" ADD CONSTRAINT "RoomAnchor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnchor" ADD CONSTRAINT "RoomAnchor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnchor" ADD CONSTRAINT "RoomAnchor_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSlot" ADD CONSTRAINT "DeviceSlot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AssetDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSlot" ADD CONSTRAINT "DeviceSlot_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSlot" ADD CONSTRAINT "DeviceSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 手机仅有卡槽 1、2；号码的唯一索引同时阻止跨卡槽、跨手机重复占用。
ALTER TABLE "DeviceSlot" ADD CONSTRAINT "DeviceSlot_valid_slot" CHECK ("slot" IN (1, 2));

-- 原有号码仅在格式有效且全库唯一时建档；开户人未知，不从抖音实名人推断。
WITH candidates AS (
  SELECT a.*, regexp_replace(a."phone", '[[:space:]()-]', '', 'g') AS normalized
  FROM "DouyinAccount" a WHERE a."phone" <> ''
), unique_numbers AS (
  SELECT normalized FROM candidates WHERE normalized ~ '^\+?[0-9]{5,20}$'
  GROUP BY normalized HAVING COUNT(*) = 1
)
INSERT INTO "PhoneNumber" ("id", "number", "branchId", "operatorId", "controllerId", "updatedAt")
SELECT 'legacy-number-' || a."id", a.normalized, a."branchId", a."operatorId", a."controllerId", CURRENT_TIMESTAMP
FROM candidates a JOIN unique_numbers u ON u.normalized = a.normalized;
UPDATE "DouyinAccount" a SET "phoneNumberId" = n."id"
FROM "PhoneNumber" n WHERE n."id" = 'legacy-number-' || a."id";
