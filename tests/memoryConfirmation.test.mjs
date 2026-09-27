import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMemoryConfirmationReply,
  createMemoryConfirmationQuestion,
  findPendingMemoryConfirmation,
} from "../lib/ai/memoryConfirmation.ts";

const candidate = {
  category: "routine",
  content: "毎朝コーヒーを飲む",
  normalizedKey: "朝のコーヒー",
  subject: "user",
  assertion: "affirmed",
  polarity: "neutral",
  temporalScope: "current",
  confidence: 0.95,
};

function message(id, role, content) {
  return { id, role, content, createdAt: new Date() };
}

test("explicit agreement and rejection are distinguished from ambiguous replies", () => {
  assert.equal(classifyMemoryConfirmationReply("はい、お願いします"), "confirmed");
  assert.equal(classifyMemoryConfirmationReply("覚えておいてください"), "confirmed");
  assert.equal(classifyMemoryConfirmationReply("いいえ、違います"), "rejected");
  assert.equal(classifyMemoryConfirmationReply("たぶんそうかな"), "unclear");
});

test("a pending confirmation is recognized only from the dedicated question", () => {
  const question = createMemoryConfirmationQuestion(candidate);
  const pending = findPendingMemoryConfirmation([
    message("user-1", "user", "私は毎朝コーヒーを飲みます"),
    message("assistant-1", "assistant", question),
    message("user-2", "user", "はい"),
  ]);

  assert.deepEqual(pending, {
    proposedContent: candidate.content,
    sourceMessageId: "user-1",
    sourceMessageContent: "私は毎朝コーヒーを飲みます",
  });
  assert.equal(
    findPendingMemoryConfirmation([
      message("user-1", "user", "私は毎朝コーヒーを飲みます"),
      message("assistant-1", "assistant", "コーヒーがお好きなんですね。"),
      message("user-2", "user", "はい"),
    ]),
    null,
  );
});
