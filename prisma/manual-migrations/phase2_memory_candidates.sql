-- Phase 2 grounded memory candidate staging tables.
-- This script stops if any required base object is missing or any target
-- object already exists, avoiding partial acceptance of an unknown schema.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Profile"') IS NULL
    OR to_regclass('public."Conversation"') IS NULL
    OR to_regclass('public."Message"') IS NULL
    OR to_regclass('public."ConversationDecision"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 1 tables are missing; aborting phase 2 migration';
  END IF;

  IF to_regclass('public."MemoryCandidate"') IS NOT NULL
    OR to_regclass('public."MemoryCandidateEvidence"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 2 tables already exist; inspect the schema before applying';
  END IF;

  IF to_regclass('public."MemoryCandidate_profileId_status_createdAt_idx"') IS NOT NULL
    OR to_regclass('public."MemoryCandidate_profileId_category_normalizedKey_idx"') IS NOT NULL
    OR to_regclass('public."MemoryCandidate_conversationId_idx"') IS NOT NULL
    OR to_regclass('public."MemoryCandidate_decisionId_idx"') IS NOT NULL
    OR to_regclass('public."MemoryCandidateEvidence_sourceMessageId_idx"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 2 indexes already exist; inspect the schema before applying';
  END IF;
END
$$;

CREATE TABLE "MemoryCandidate" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "assertion" TEXT NOT NULL,
  "polarity" TEXT NOT NULL,
  "temporalScope" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "extractionVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryCandidateEvidence" (
  "candidateId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,

  CONSTRAINT "MemoryCandidateEvidence_pkey"
    PRIMARY KEY ("candidateId", "sourceMessageId")
);

CREATE INDEX "MemoryCandidate_profileId_status_createdAt_idx"
  ON "MemoryCandidate"("profileId", "status", "createdAt");

CREATE INDEX "MemoryCandidate_profileId_category_normalizedKey_idx"
  ON "MemoryCandidate"("profileId", "category", "normalizedKey");

CREATE INDEX "MemoryCandidate_conversationId_idx"
  ON "MemoryCandidate"("conversationId");

CREATE INDEX "MemoryCandidate_decisionId_idx"
  ON "MemoryCandidate"("decisionId");

CREATE INDEX "MemoryCandidateEvidence_sourceMessageId_idx"
  ON "MemoryCandidateEvidence"("sourceMessageId");

ALTER TABLE "MemoryCandidate"
  ADD CONSTRAINT "MemoryCandidate_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryCandidate"
  ADD CONSTRAINT "MemoryCandidate_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryCandidate"
  ADD CONSTRAINT "MemoryCandidate_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "ConversationDecision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryCandidateEvidence"
  ADD CONSTRAINT "MemoryCandidateEvidence_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "MemoryCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryCandidateEvidence"
  ADD CONSTRAINT "MemoryCandidateEvidence_sourceMessageId_fkey"
  FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
