-- Phase 3 confirmed memories and candidate-resolution audit trail.
-- Apply only after independently verifying the target is the disposable
-- verification branch. This migration contains no environment identifiers.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Profile"') IS NULL
    OR to_regclass('public."MemoryCandidate"') IS NULL
    OR to_regclass('public."MemoryCandidateEvidence"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 2 tables are missing; aborting phase 3 migration';
  END IF;

  IF to_regclass('public."Memory"') IS NOT NULL
    OR to_regclass('public."MemoryResolution"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 3 tables already exist; inspect the schema before applying';
  END IF;

  IF to_regclass('public."Memory_profileId_status_createdAt_idx"') IS NOT NULL
    OR to_regclass('public."Memory_profileId_category_normalizedKey_status_idx"') IS NOT NULL
    OR to_regclass('public."MemoryResolution_targetMemoryId_idx"') IS NOT NULL
    OR to_regclass('public."MemoryResolution_action_processedAt_idx"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 3 indexes already exist; inspect the schema before applying';
  END IF;
END
$$;

CREATE TABLE "Memory" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "polarity" TEXT NOT NULL,
  "temporalScope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryResolution" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetMemoryId" TEXT,
  "resultMemoryId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Memory_supersedesId_key" ON "Memory"("supersedesId");
CREATE INDEX "Memory_profileId_status_createdAt_idx"
  ON "Memory"("profileId", "status", "createdAt");
CREATE INDEX "Memory_profileId_category_normalizedKey_status_idx"
  ON "Memory"("profileId", "category", "normalizedKey", "status");

CREATE UNIQUE INDEX "MemoryResolution_candidateId_key"
  ON "MemoryResolution"("candidateId");
CREATE UNIQUE INDEX "MemoryResolution_resultMemoryId_key"
  ON "MemoryResolution"("resultMemoryId");
CREATE INDEX "MemoryResolution_targetMemoryId_idx"
  ON "MemoryResolution"("targetMemoryId");
CREATE INDEX "MemoryResolution_action_processedAt_idx"
  ON "MemoryResolution"("action", "processedAt");

ALTER TABLE "Memory"
  ADD CONSTRAINT "Memory_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Memory"
  ADD CONSTRAINT "Memory_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "Memory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemoryResolution"
  ADD CONSTRAINT "MemoryResolution_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "MemoryCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemoryResolution"
  ADD CONSTRAINT "MemoryResolution_targetMemoryId_fkey"
  FOREIGN KEY ("targetMemoryId") REFERENCES "Memory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemoryResolution"
  ADD CONSTRAINT "MemoryResolution_resultMemoryId_fkey"
  FOREIGN KEY ("resultMemoryId") REFERENCES "Memory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 evidence uses ON DELETE CASCADE. Once a candidate has an audit
-- resolution, prevent a direct evidence delete (including a cascade from its
-- source Message) from silently breaking provenance. Unresolved staging rows
-- retain their existing phase 2 deletion behavior.
CREATE FUNCTION "protectResolvedMemoryEvidence"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MemoryResolution"
    WHERE "candidateId" = OLD."candidateId"
  ) THEN
    RAISE EXCEPTION 'Resolved memory evidence cannot be deleted'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END
$$;

CREATE TRIGGER "MemoryCandidateEvidence_resolved_delete_guard"
  BEFORE DELETE ON "MemoryCandidateEvidence"
  FOR EACH ROW
  EXECUTE FUNCTION "protectResolvedMemoryEvidence"();

COMMIT;
