-- Phase 10 reply-generation rejection audit field.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."MemoryRetrievalAudit"') IS NULL THEN
    RAISE EXCEPTION 'Required memory retrieval audit table is missing; aborting phase 10 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MemoryRetrievalAudit' AND column_name = 'generationRejectionReason'
  ) THEN
    RAISE EXCEPTION 'Phase 10 audit column already exists; inspect the schema before applying';
  END IF;
END
$$;

ALTER TABLE "MemoryRetrievalAudit"
  ADD COLUMN "generationRejectionReason" TEXT;

COMMIT;
