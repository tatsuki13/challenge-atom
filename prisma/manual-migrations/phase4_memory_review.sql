-- Phase 4 user-reviewed memory text audit fields.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."MemoryResolution"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 3 table is missing; aborting phase 4 migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MemoryResolution'
      AND column_name IN ('reviewedContent', 'reviewedNormalizedKey')
  ) THEN
    RAISE EXCEPTION 'One or more phase 4 columns already exist; inspect the schema before applying';
  END IF;
END
$$;

ALTER TABLE "MemoryResolution"
  ADD COLUMN "reviewedContent" TEXT,
  ADD COLUMN "reviewedNormalizedKey" TEXT;

COMMIT;
