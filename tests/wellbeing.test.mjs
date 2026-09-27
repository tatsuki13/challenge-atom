import assert from "node:assert/strict";
import test from "node:test";
import { scoreEmotions, suggestConversation } from "../lib/wellbeing.ts";

test("感情の四項目は独立した0〜1の数値になる", () => {
  const scores = scoreEmotions("ひとりで寂しいけれど、散歩が楽しいし趣味も好き");
  assert.equal(scores.loneliness, 0.65);
  assert.equal(scores.anxiety, 0);
  assert.equal(scores.positive_affect, 0.45);
  assert.equal(scores.interest, 0.65);
});

test("不安があるときは質問を控える方針を優先する", () => {
  const scores = scoreEmotions("不安だけど趣味の話は楽しい");
  assert.match(suggestConversation(scores, null), /質問を重ねず/);
});

test("睡眠データがないときに身体状態を推定しない", () => {
  const scores = scoreEmotions("こんにちは");
  assert.match(suggestConversation(scores, null), /発話の具体的な内容/);
});
