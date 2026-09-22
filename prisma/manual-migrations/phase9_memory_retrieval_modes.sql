-- Phase 9 retrieval-mode and usage-role audit fields.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."MemoryRetrievalAudit"') IS NULL
    OR to_regclass('public."MemoryUsage"') IS NULL THEN
    RAISE EXCEPTION 'Required memory audit tables are missing; aborting phase 9 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MemoryRetrievalAudit' AND column_name = 'plannedMode'
  ) THEN
    RAISE EXCEPTION 'Phase 9 audit columns already exist; inspect the schema before applying';
  END IF;
END
$$;

ALTER TABLE "MemoryRetrievalAudit"
  ADD COLUMN "plannedMode" TEXT,
  ADD COLUMN "finalMode" TEXT,
  ADD COLUMN "noSearchReason" TEXT,
  ADD COLUMN "clarificationReason" TEXT;

ALTER TABLE "MemoryUsage"
  ADD COLUMN "usageRole" TEXT;

COMMIT;
