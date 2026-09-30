-- 仅追加字段；旧账号与历史的启停状态保持不变。
ALTER TABLE "DouyinAccount" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "unbanDate" TEXT;
ALTER TABLE "AccountRecord" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "unbanDate" TEXT;
ALTER TABLE "DouyinAccount" ADD CONSTRAINT "DouyinAccount_ban_state_check" CHECK ((NOT "banned" OR NOT "active") AND ("banned" OR "unbanDate" IS NULL));
ALTER TABLE "AccountRecord" ADD CONSTRAINT "AccountRecord_ban_state_check" CHECK ((NOT "banned" OR NOT "active") AND ("banned" OR "unbanDate" IS NULL));
