-- Phase 7 memory retrieval audit trail.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Memory"') IS NULL
    OR to_regclass('public."MemoryUsage"') IS NULL
    OR to_regclass('public."ConversationDecision"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 5 tables are missing; aborting phase 7 migration';
  END IF;
  IF to_regclass('public."MemoryRetrievalAudit"') IS NOT NULL
    OR to_regclass('public."MemoryRetrievalAuditResult"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 7 tables already exist; inspect the schema before applying';
  END IF;
END
$$;

CREATE TABLE "MemoryRetrievalAudit" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "executed" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL,
  "categories" JSONB NOT NULL,
  "activeMemoryCount" INTEGER NOT NULL,
  "thresholdPassedCount" INTEGER NOT NULL,
  "selectedCount" INTEGER NOT NULL,
  "failureReason" TEXT,
  "configVersion" TEXT NOT NULL,
  "minimumScore" DOUBLE PRECISION NOT NULL,
  "maxResults" INTEGER NOT NULL,
  "maxContextCharacters" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryRetrievalAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryRetrievalAuditResult" (
  "auditId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "categoryMatch" DOUBLE PRECISION NOT NULL,
  "normalizedKeyExact" DOUBLE PRECISION NOT NULL,
  "normalizedKeyPartial" DOUBLE PRECISION NOT NULL,
  "contentPartial" DOUBLE PRECISION NOT NULL,
  "bigramSimilarity" DOUBLE PRECISION NOT NULL,
  "bigramScore" DOUBLE PRECISION NOT NULL,
  "finalScore" DOUBLE PRECISION NOT NULL,
  "disposition" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryRetrievalAuditResult_pkey" PRIMARY KEY ("auditId", "memoryId")
);

CREATE UNIQUE INDEX "Memory_id_profileId_key" ON "Memory"("id", "profileId");
CREATE UNIQUE INDEX "MemoryRetrievalAudit_decisionId_key" ON "MemoryRetrievalAudit"("decisionId");
CREATE UNIQUE INDEX "MemoryRetrievalAudit_id_profileId_key" ON "MemoryRetrievalAudit"("id", "profileId");
CREATE INDEX "MemoryRetrievalAudit_profileId_createdAt_idx" ON "MemoryRetrievalAudit"("profileId", "createdAt");
CREATE INDEX "MemoryRetrievalAudit_status_createdAt_idx" ON "MemoryRetrievalAudit"("status", "createdAt");
CREATE INDEX "MemoryRetrievalAuditResult_memoryId_createdAt_idx" ON "MemoryRetrievalAuditResult"("memoryId", "createdAt");
CREATE INDEX "MemoryRetrievalAuditResult_profileId_disposition_createdAt_idx" ON "MemoryRetrievalAuditResult"("profileId", "disposition", "createdAt");

ALTER TABLE "MemoryRetrievalAudit" ADD CONSTRAINT "MemoryRetrievalAudit_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ConversationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryRetrievalAudit" ADD CONSTRAINT "MemoryRetrievalAudit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryRetrievalAuditResult" ADD CONSTRAINT "MemoryRetrievalAuditResult_auditId_profileId_fkey" FOREIGN KEY ("auditId", "profileId") REFERENCES "MemoryRetrievalAudit"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryRetrievalAuditResult" ADD CONSTRAINT "MemoryRetrievalAuditResult_memoryId_profileId_fkey" FOREIGN KEY ("memoryId", "profileId") REFERENCES "Memory"("id", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
