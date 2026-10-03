CREATE TABLE "ReportingSetting" (
 "id" TEXT NOT NULL PRIMARY KEY, "role" TEXT NOT NULL DEFAULT 'LEAD_SPECIALIST',
 "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReportingSetting_role_check" CHECK ("role" IN ('CONTROLLER','LEAD_SPECIALIST'))
);
ALTER TABLE "WorkSession" ADD COLUMN "liveDataRole" TEXT,
 ADD COLUMN "liveDataDraft" JSONB NOT NULL DEFAULT '{}',
 ADD COLUMN "liveDataSubmittedAt" TIMESTAMP(3),
 ADD COLUMN "liveDataVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_liveDataRole_check" CHECK ("liveDataRole" IS NULL OR "liveDataRole" IN ('CONTROLLER','LEAD_SPECIALIST'));
