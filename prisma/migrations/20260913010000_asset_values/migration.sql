-- 增量添加资产类别和可空价值字段，不修改任何旧业务字段或关联。
ALTER TYPE "DeviceKind" ADD VALUE 'MATERIAL';
ALTER TABLE "AssetDevice"
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT '件',
  ADD COLUMN "purchaseDate" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "purchaseUnitPriceCents" INTEGER,
  ADD COLUMN "currentUnitValueCents" INTEGER;
ALTER TABLE "AssetDevice"
  ADD CONSTRAINT "AssetDevice_quantity_check" CHECK ("quantity" IS NULL OR ("quantity" BETWEEN 1 AND 1000000 AND ("kind"::text <> 'PHONE' OR "quantity" = 1))),
  ADD CONSTRAINT "AssetDevice_purchase_price_check" CHECK ("purchaseUnitPriceCents" IS NULL OR "purchaseUnitPriceCents" >= 0),
  ADD CONSTRAINT "AssetDevice_current_value_check" CHECK ("currentUnitValueCents" IS NULL OR "currentUnitValueCents" >= 0);
