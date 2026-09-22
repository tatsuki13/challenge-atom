-- Phase 6 confirmed-memory management and conversation request audit trail.
-- Apply only after independently verifying the disposable verification branch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public."Memory"') IS NULL
    OR to_regclass('public."MemoryUsage"') IS NULL
    OR to_regclass('public."ConversationDecision"') IS NULL THEN
    RAISE EXCEPTION 'Required phase 3-5 tables are missing; aborting phase 6 migration';
  END IF;
  IF to_regclass('public."MemoryManagementAction"') IS NOT NULL
    OR to_regclass('public."MemoryManagementRequest"') IS NOT NULL
    OR to_regclass('public."MemoryManagementRequestMatch"') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more phase 6 tables already exist; inspect the schema before applying';
  END IF;
END
$$;

CREATE TABLE "MemoryManagementAction" (
  "id" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "targetMemoryId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resultMemoryId" TEXT,
  "actor" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryManagementAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryManagementRequest" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "searchTerms" JSONB NOT NULL,
  "correctedContent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "selectedMemoryId" TEXT,
  "managementActionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "MemoryManagementRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryManagementRequestMatch" (
  "requestId" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "MemoryManagementRequestMatch_pkey" PRIMARY KEY ("requestId", "memoryId")
);

CREATE UNIQUE INDEX "MemoryManagementAction_requestKey_key" ON "MemoryManagementAction"("requestKey");
CREATE UNIQUE INDEX "MemoryManagementAction_resultMemoryId_key" ON "MemoryManagementAction"("resultMemoryId");
CREATE INDEX "MemoryManagementAction_profileId_createdAt_idx" ON "MemoryManagementAction"("profileId", "createdAt");
CREATE INDEX "MemoryManagementAction_targetMemoryId_createdAt_idx" ON "MemoryManagementAction"("targetMemoryId", "createdAt");
CREATE UNIQUE INDEX "MemoryManagementRequest_sourceMessageId_key" ON "MemoryManagementRequest"("sourceMessageId");
CREATE UNIQUE INDEX "MemoryManagementRequest_decisionId_key" ON "MemoryManagementRequest"("decisionId");
CREATE UNIQUE INDEX "MemoryManagementRequest_managementActionId_key" ON "MemoryManagementRequest"("managementActionId");
CREATE INDEX "MemoryManagementRequest_profileId_status_createdAt_idx" ON "MemoryManagementRequest"("profileId", "status", "createdAt");
CREATE INDEX "MemoryManagementRequest_conversationId_idx" ON "MemoryManagementRequest"("conversationId");
CREATE INDEX "MemoryManagementRequestMatch_memoryId_idx" ON "MemoryManagementRequestMatch"("memoryId");

ALTER TABLE "MemoryManagementAction" ADD CONSTRAINT "MemoryManagementAction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementAction" ADD CONSTRAINT "MemoryManagementAction_targetMemoryId_fkey" FOREIGN KEY ("targetMemoryId") REFERENCES "Memory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementAction" ADD CONSTRAINT "MemoryManagementAction_resultMemoryId_fkey" FOREIGN KEY ("resultMemoryId") REFERENCES "Memory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ConversationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_selectedMemoryId_fkey" FOREIGN KEY ("selectedMemoryId") REFERENCES "Memory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequest" ADD CONSTRAINT "MemoryManagementRequest_managementActionId_fkey" FOREIGN KEY ("managementActionId") REFERENCES "MemoryManagementAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequestMatch" ADD CONSTRAINT "MemoryManagementRequestMatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MemoryManagementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryManagementRequestMatch" ADD CONSTRAINT "MemoryManagementRequestMatch_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
