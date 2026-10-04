ALTER TABLE "LeadBackend" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DouyinAccount" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INTERNAL';
UPDATE "DouyinAccount" SET "kind" = 'EXTERNAL' WHERE "externalAnchorId" IS NOT NULL;
ALTER TABLE "DouyinAccount" ALTER COLUMN "branchId" DROP NOT NULL;
ALTER TABLE "AccountRecord" ALTER COLUMN "branchId" DROP NOT NULL;
ALTER TABLE "ExternalAnchor" ALTER COLUMN "branchId" DROP NOT NULL;
ALTER TABLE "DirectLeadTask" ADD COLUMN "branchName" TEXT;
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "account_kind_branch" CHECK (("kind" = 'INTERNAL' AND "branchId" IS NOT NULL) OR ("kind" = 'EXTERNAL' AND "externalAnchorId" IS NOT NULL));
