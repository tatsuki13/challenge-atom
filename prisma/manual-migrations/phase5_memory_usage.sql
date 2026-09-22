-- Phase 5 audit trail for confirmed memories supplied to assistant responses.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Memory"') IS NULL
    OR to_regclass('public."Message"') IS NULL
    OR to_regclass('public."Conversation"') IS NULL
    OR to_regclass('public."ConversationDecision"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 1-4 tables are missing; aborting phase 5 migration';
  END IF;

  IF to_regclass('public."MemoryUsage"') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 5 table already exists; inspect the schema before applying';
  END IF;
END
$$;

CREATE TABLE "MemoryUsage" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "assistantMessageId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "retrievalScore" DOUBLE PRECISION NOT NULL,
  "usageReason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryUsage_assistantMessageId_memoryId_key"
  ON "MemoryUsage"("assistantMessageId", "memoryId");
CREATE INDEX "MemoryUsage_memoryId_createdAt_idx"
  ON "MemoryUsage"("memoryId", "createdAt");
CREATE INDEX "MemoryUsage_decisionId_idx" ON "MemoryUsage"("decisionId");
CREATE INDEX "MemoryUsage_conversationId_createdAt_idx"
  ON "MemoryUsage"("conversationId", "createdAt");

ALTER TABLE "MemoryUsage"
  ADD CONSTRAINT "MemoryUsage_memoryId_fkey"
  FOREIGN KEY ("memoryId") REFERENCES "Memory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryUsage"
  ADD CONSTRAINT "MemoryUsage_assistantMessageId_fkey"
  FOREIGN KEY ("assistantMessageId") REFERENCES "Message"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryUsage"
  ADD CONSTRAINT "MemoryUsage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryUsage"
  ADD CONSTRAINT "MemoryUsage_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "ConversationDecision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
