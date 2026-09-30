-- 仅增加拆分标记与来源关联，不自动拆分或修改旧记录。
ALTER TABLE "AssetDevice"
  ADD COLUMN "individual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "splitAt" TIMESTAMP(3),
  ADD COLUMN "sourceAssetId" TEXT;
CREATE INDEX "AssetDevice_sourceAssetId_idx" ON "AssetDevice"("sourceAssetId");
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "AssetDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetDevice" ADD CONSTRAINT "AssetDevice_individual_quantity_check"
  CHECK (NOT "individual" OR ("quantity" IS NOT NULL AND "quantity" = 1));
