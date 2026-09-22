-- Phase 8 retrieval request source and attribute scoring audit fields.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."MemoryRetrievalAudit"') IS NULL
    OR to_regclass('public."MemoryRetrievalAuditResult"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 7 audit tables are missing; aborting phase 8 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MemoryRetrievalAudit' AND column_name = 'requestSource'
  ) THEN
    RAISE EXCEPTION 'Phase 8 audit columns already exist; inspect the schema before applying';
  END IF;
END
$$;

ALTER TABLE "MemoryRetrievalAudit"
  ADD COLUMN "requestSource" TEXT,
  ADD COLUMN "planNotRequestedReason" TEXT,
  ADD COLUMN "polarities" JSONB,
  ADD COLUMN "temporalScopes" JSONB,
  ADD COLUMN "attributeStrategy" TEXT;

ALTER TABLE "MemoryRetrievalAuditResult"
  ADD COLUMN "polarityMatch" DOUBLE PRECISION,
  ADD COLUMN "polarityMismatch" DOUBLE PRECISION,
  ADD COLUMN "temporalScopeMatch" DOUBLE PRECISION,
  ADD COLUMN "temporalScopeMismatch" DOUBLE PRECISION;

COMMIT;
