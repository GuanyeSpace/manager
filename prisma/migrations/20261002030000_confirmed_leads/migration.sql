ALTER TABLE "WorkSession" ADD COLUMN "actualAnchorId" TEXT, ADD COLUMN "actualAnchorName" TEXT;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_actualAnchorId_fkey" FOREIGN KEY ("actualAnchorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "LeadBackend" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "LeadBackend_name_key" ON "LeadBackend"("name");
CREATE TABLE "ConfirmedLead" (
 "id" TEXT PRIMARY KEY, "day" TEXT NOT NULL, "anchorId" TEXT NOT NULL, "anchorName" TEXT NOT NULL,
 "backendId" TEXT NOT NULL, "backendName" TEXT NOT NULL, "backendUrl" TEXT NOT NULL,
 "joinCount" INTEGER NOT NULL, "effectiveCount" INTEGER NOT NULL, "backendUnitCents" INTEGER NOT NULL, "anchorUnitCents" INTEGER NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ConfirmedLead_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ConfirmedLead_backendId_fkey" FOREIGN KEY ("backendId") REFERENCES "LeadBackend"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ConfirmedLead_counts_check" CHECK ("joinCount">=0 AND "effectiveCount">=0 AND "effectiveCount"<="joinCount" AND "backendUnitCents">=0 AND "anchorUnitCents">=0)
);
CREATE UNIQUE INDEX "ConfirmedLead_day_anchorId_backendId_key" ON "ConfirmedLead"("day","anchorId","backendId");
CREATE INDEX "ConfirmedLead_anchorId_day_idx" ON "ConfirmedLead"("anchorId","day");
