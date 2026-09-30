-- AlterTable
ALTER TABLE "AssetDevice" ADD COLUMN     "loginWechats" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PhoneAccountLogin" (
    "deviceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "PhoneAccountLogin_pkey" PRIMARY KEY ("deviceId","accountId")
);

-- CreateIndex
CREATE INDEX "PhoneAccountLogin_accountId_idx" ON "PhoneAccountLogin"("accountId");

-- CreateIndex
CREATE INDEX "PhoneAccountLogin_branchId_idx" ON "PhoneAccountLogin"("branchId");

-- AddForeignKey
ALTER TABLE "PhoneAccountLogin" ADD CONSTRAINT "PhoneAccountLogin_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AssetDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAccountLogin" ADD CONSTRAINT "PhoneAccountLogin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DouyinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAccountLogin" ADD CONSTRAINT "PhoneAccountLogin_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
