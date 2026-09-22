-- Phase 1 conversation tracking schema additions.
-- Generated from the audited Prisma diff on 2026-09-22.
-- This script intentionally stops if any target object already exists so that
-- a same-named but structurally different object is never silently accepted.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Profile"') IS NULL
    OR to_regclass('public."Conversation"') IS NULL
    OR to_regclass('public."Message"') IS NULL THEN
    RAISE EXCEPTION 'Required base tables are missing; aborting phase 1 migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Message'
      AND column_name IN ('rawContent', 'inputType', 'clientMessageId')
  ) THEN
    RAISE EXCEPTION 'One or more target Message columns already exist; re-run schema inspection before applying';
  END IF;

  IF to_regclass('public."ConversationDecision"') IS NOT NULL
    OR to_regclass('public."DecisionSourceUtterance"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more target tables already exist; re-run schema inspection before applying';
  END IF;

  IF to_regclass('public."Message_conversationId_clientMessageId_idx"') IS NOT NULL
    OR to_regclass('public."ConversationDecision_responseMessageId_key"') IS NOT NULL
    OR to_regclass('public."ConversationDecision_conversationId_createdAt_idx"') IS NOT NULL
    OR to_regclass('public."DecisionSourceUtterance_sourceMessageId_idx"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more target indexes already exist; re-run schema inspection before applying';
  END IF;
END
$$;

ALTER TABLE "Message"
  ADD COLUMN "clientMessageId" TEXT,
  ADD COLUMN "inputType" TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN "rawContent" TEXT;

CREATE TABLE "ConversationDecision" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "responseMessageId" TEXT NOT NULL,
  "listeningStrategy" TEXT,
  "planSource" TEXT NOT NULL,
  "generationSource" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "mainFocus" TEXT,
  "shouldAskQuestion" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionSourceUtterance" (
  "decisionId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,

  CONSTRAINT "DecisionSourceUtterance_pkey"
    PRIMARY KEY ("decisionId", "sourceMessageId")
);

CREATE UNIQUE INDEX "ConversationDecision_responseMessageId_key"
  ON "ConversationDecision"("responseMessageId");

CREATE INDEX "ConversationDecision_conversationId_createdAt_idx"
  ON "ConversationDecision"("conversationId", "createdAt");

CREATE INDEX "DecisionSourceUtterance_sourceMessageId_idx"
  ON "DecisionSourceUtterance"("sourceMessageId");

CREATE INDEX "Message_conversationId_clientMessageId_idx"
  ON "Message"("conversationId", "clientMessageId");

ALTER TABLE "ConversationDecision"
  ADD CONSTRAINT "ConversationDecision_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationDecision"
  ADD CONSTRAINT "ConversationDecision_responseMessageId_fkey"
  FOREIGN KEY ("responseMessageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionSourceUtterance"
  ADD CONSTRAINT "DecisionSourceUtterance_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "ConversationDecision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionSourceUtterance"
  ADD CONSTRAINT "DecisionSourceUtterance_sourceMessageId_fkey"
  FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
