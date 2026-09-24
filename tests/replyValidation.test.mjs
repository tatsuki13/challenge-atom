import assert from "node:assert/strict";
import test from "node:test";
import {
  countQuestions,
  getReplyContract,
  validateReplyAgainstContract,
} from "../lib/ai/replyValidation.ts";

const blueHat = { category: "preference", content: "青い帽子が好き", polarity: "positive", temporalScope: "current" };
const dog = { category: "preference", content: "犬が好き", polarity: "positive", temporalScope: "current" };
const coffee = { category: "preference", content: "深煎りコーヒーが好き", polarity: "positive", temporalScope: "current" };

function validate(text, memoryMode, options = {}) {
  return validateReplyAgainstContract({
    text,
    memoryMode,
    memorySelectionRequired: options.memorySelectionRequired ?? false,
    listeningStrategy: options.listeningStrategy ?? "show_interest",
    memories: options.memories ?? [],
    currentUserMessage: options.currentUserMessage ?? "前の話を確認したい",
  });
}

test("question counting ignores quotes and candidate bullets and coalesces punctuation runs", () => {
  assert.equal(countQuestions("『前にも話した？』ということですね。どの話題ですか？"), 1);
  assert.equal(countQuestions("- 犬が好き？\n- コーヒーが好き？\nどちらのことですか?!"), 1);
  assert.equal(countQuestions("Which one?"), 1);
  assert.equal(countQuestions("どの話題ですか"), 1);
  assert.equal(countQuestions("犬ですか？ 猫ですか？"), 2);
  assert.equal(countQuestions("犬と猫なら、どちらが好きで最近も変わりませんか？"), 1);
});

test("mode contracts accept valid synthetic replies", () => {
  assert.equal(validate("青い帽子がお好きでしたね。最近もよくかぶりますか？", "topic_match", { memories: [blueHat], currentUserMessage: "青い帽子について前に話した？" }).accepted, true);
  assert.equal(validate("青い帽子の話、前にも出ていましたね。どんな帽子だったか少し気になります。", "topic_match", { memories: [blueHat], currentUserMessage: "青い帽子について前に話した？" }).accepted, true);
  assert.equal(validate("- 犬が好き\n- 深煎りコーヒーが好き\nどちらについて確認したいですか？", "category_browse", { memories: [dog, coffee], memorySelectionRequired: true }).accepted, true);
  assert.equal(validate("犬がお好きで、深煎りコーヒーもお好きだと確認しています。気になるほうから聞かせてください。", "category_browse", { memories: [dog, coffee] }).accepted, true);
  assert.equal(validate("そうだったんですね。続きがあれば、ゆっくり聞かせてください。", "none").accepted, true);
  assert.equal(validate("そうだったんですね。", "none", { listeningStrategy: "allow_silence" }).accepted, true);
  assert.equal(validate("以前のお話のうち、どの話題についてですか？", "clarification").accepted, true);
  assert.equal(validate("確認したい話題をもう少し具体的に教えてください。", "clarification").accepted, true);
  assert.equal(validate("『前にも話した？』という意味ですね。どの話題ですか？", "clarification").accepted, true);
  assert.equal(validate("Which topic do you mean?", "clarification").accepted, true);
});

test("mode contracts reject invalid synthetic replies with deterministic reasons", () => {
  assert.equal(validate("犬のことですか？ 猫のことですか？", "topic_match", { memories: [dog] }).reason, "too_many_questions");
  assert.equal(validate("猫が好きだと前に話していましたね。", "clarification").reason, "unsupported_memory_claim");
  assert.equal(validate("犬が好きで、猫も好きでしたね。", "category_browse", { memories: [dog] }).reason, "unsupported_memory_claim");
  assert.equal(validate("青い帽子が好きでしたね。", "topic_match", { memories: [blueHat], currentUserMessage: "青い帽子が嫌いになりました" }).reason, "mode_contract_violation");
  assert.equal(validate("前のお話を覚えています。", "none").reason, "unsupported_memory_claim");
  assert.equal(validate("   ", "topic_match", { memories: [blueHat] }).reason, "empty_response");
  assert.equal(validate("候補はこちらです。", "category_browse", { memories: [dog, coffee], memorySelectionRequired: true }).reason, "missing_clarification");
  assert.equal(validate("そうだったんですね。", "none").reason, "missing_continuation_cue");
});

test("safety contract does not apply normal question limits", () => {
  const contract = getReplyContract("safety");
  assert.equal(contract.maximumQuestions, null);
  assert.equal(contract.requiresContinuationCue, false);
  assert.equal(getReplyContract("none", false, "allow_silence").requiresContinuationCue, false);
  assert.equal(validate("今、安全な場所にいますか？近くの人へ連絡できますか？", "safety").accepted, true);
});
