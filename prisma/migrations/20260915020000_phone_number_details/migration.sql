ALTER TABLE "PhoneNumber"
 ADD COLUMN "xiaohongshu" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "kuaishou" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "monthlyFeeCents" INTEGER,
 ADD COLUMN "dataGb" DECIMAL(10,2),
 ADD COLUMN "cardType" TEXT,
 ADD COLUMN "mainCardId" TEXT,
 ADD COLUMN "status" TEXT,
 ADD COLUMN "otherPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_mainCardId_fkey" FOREIGN KEY ("mainCardId") REFERENCES "PhoneNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_plan_check" CHECK (("cardType" IS NULL AND "mainCardId" IS NULL) OR ("cardType" = 'MAIN' AND "mainCardId" IS NULL) OR ("cardType" = 'SECONDARY' AND "mainCardId" IS NOT NULL AND "mainCardId" <> "id"));
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_values_check" CHECK (("monthlyFeeCents" IS NULL OR "monthlyFeeCents" >= 0) AND ("dataGb" IS NULL OR "dataGb" >= 0) AND ("status" IS NULL OR "status" IN ('NORMAL', 'SUSPENDED', 'CANCELLED')));
CREATE INDEX "PhoneNumber_mainCardId_idx" ON "PhoneNumber"("mainCardId");
CREATE INDEX "PhoneNumber_branchId_status_idx" ON "PhoneNumber"("branchId", "status");
