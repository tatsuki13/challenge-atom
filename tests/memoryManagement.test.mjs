import assert from "node:assert/strict";
import test from "node:test";
import {
  isMemoryManagementAction,
  isMemoryManagementReasonCode,
  validateMemoryManagementInput,
} from "../lib/memoryManagementRules.ts";
import { normalizeReviewedMemoryContent } from "../lib/memoryResolutionRules.ts";

const baseInput = {
  profileId: "profile-a",
  requestKey: "request-a",
  memoryId: "memory-a",
  actor: "user",
};

test("management action and reason allowlists reject unknown values", () => {
  assert.equal(isMemoryManagementAction("EDIT"), true);
  assert.equal(isMemoryManagementAction("DELETE"), false);
  assert.equal(isMemoryManagementReasonCode("conversation_forget"), true);
  assert.equal(isMemoryManagementReasonCode("erase_forever"), false);
});

test("action and reason combinations are checked", () => {
  assert.equal(
    validateMemoryManagementInput({
      ...baseInput,
      action: "EDIT",
      reasonCode: "user_edit",
      reviewedContent: "犬が好き",
    }),
    null,
  );
  assert.match(
    validateMemoryManagementInput({
      ...baseInput,
      action: "RESTORE",
      reasonCode: "conversation_forget",
    }),
    /reasonCode/,
  );
});

test("only edit accepts reviewed content", () => {
  assert.match(
    validateMemoryManagementInput({
      ...baseInput,
      action: "EDIT",
      reasonCode: "user_edit",
    }),
    /reviewedContent/,
  );
  assert.match(
    validateMemoryManagementInput({
      ...baseInput,
      action: "ARCHIVE",
      reasonCode: "user_archive",
      reviewedContent: "unexpected",
    }),
    /must not include/,
  );
});

test("edited content uses the existing normalization and length rules", () => {
  assert.deepEqual(normalizeReviewedMemoryContent("  ＡＢＣ　が好き  "), {
    ok: true,
    content: "ABC が好き",
    normalizedKey: "abcが好き",
  });
  assert.equal(normalizeReviewedMemoryContent("   ").ok, false);
  assert.equal(normalizeReviewedMemoryContent("あ".repeat(241)).ok, false);
});
