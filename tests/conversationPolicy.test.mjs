import assert from "node:assert/strict";
import test from "node:test";
import { buildTurnPlanInstruction } from "../lib/ai/conversationPrompt.ts";
import { analyzeConversationTurn } from "../lib/ai/conversationEngine.ts";

function message(id, role, content) {
  return { id, role, content, createdAt: new Date() };
}

function plan(userMessage, recentMessages = [], safetyResult = "none") {
  return analyzeConversationTurn({ userMessage, recentMessages, safetyResult });
}

test("a concrete casual topic stays optional instead of forcing a question", () => {
  const result = plan("庭の花が咲いてね");
  assert.equal(result.mainFocus, "花");
  assert.equal(result.responsePurpose, "continue_topic");
  assert.equal(result.questionPolicy, "optional");
  assert.equal(result.shouldAskQuestion, false);
});

test("an absent family member does not become an inferred emotion or contact proposal", () => {
  const result = plan("娘が来なくてね");
  assert.equal(result.responsePurpose, "continue_topic");
  assert.equal(result.conversationSignals.explicitFeeling, false);
  assert.ok(result.avoidPatterns.some((item) => item.includes("寂しさ")));
  assert.ok(result.avoidPatterns.some((item) => item.includes("連絡")));
});

test("a low-energy statement asks only for today's preference", () => {
  const result = plan("今日はだるい");
  assert.equal(result.conversationSignals.lowEnergyStatement, true);
  assert.equal(result.responsePurpose, "clarify");
  assert.equal(result.questionPolicy, "required");
  assert.equal(result.listeningStrategy, "ask_clarification");
});

test("short replies, repeated questions, topic changes, and rejected proposals alter policy", () => {
  const short = plan("うん", [message("a1", "assistant", "今日は何をされましたか？")]);
  assert.equal(short.responsePurpose, "receive");
  assert.equal(short.questionPolicy, "avoid");

  const repeated = plan("そうですね", [
    message("a1", "assistant", "今日は何をされましたか？"),
    message("u1", "user", "散歩です"),
    message("a2", "assistant", "どこまで歩きましたか？"),
  ]);
  assert.equal(repeated.conversationSignals.repeatedQuestions, true);
  assert.equal(repeated.questionPolicy, "avoid");

  const changed = plan("別の話にしたい", [message("a1", "assistant", "花の話を続けますか？")]);
  assert.equal(changed.responsePurpose, "follow_preference");
  assert.equal(changed.conversationSignals.topicChangeTargetProvided, false);
  assert.equal(changed.questionPolicy, "required");
  assert.equal(changed.listeningStrategy, "ask_clarification");

  const changedWithTarget = plan("別の話にしたい。庭の花が咲いてね");
  assert.equal(changedWithTarget.conversationSignals.topicChangeTargetProvided, true);
  assert.equal(changedWithTarget.mainFocus, "花");
  assert.equal(changedWithTarget.questionPolicy, "optional");
  assert.equal(changedWithTarget.shouldAskQuestion, false);

  const rejected = plan("今はいいです", [message("a1", "assistant", "少し散歩してみませんか？")]);
  assert.equal(rejected.conversationSignals.proposalRejected, true);
  assert.equal(rejected.responsePurpose, "receive");
  assert.equal(rejected.questionPolicy, "avoid");
});

test("urgent language keeps the existing safety route dominant", () => {
  const result = plan("息が苦しい", [], "urgent");
  assert.equal(result.mode, "safety");
  assert.equal(result.responsePurpose, "safety");
});

test("generation input carries purpose, history reactions, and grounding limits", () => {
  const userMessage = "庭の花が咲いてね";
  const turnPlan = plan(userMessage, [message("a1", "assistant", "今日はどうでしたか？")]);
  const systemText = buildTurnPlanInstruction({
    userMessage,
    turnPlan,
    recentAssistantReplies: ["今日はどうでしたか？"],
    topicStarter: false,
    topicTitle: null,
  });

  assert.match(systemText, /responsePurpose: continue_topic/);
  assert.match(systemText, /questionPolicy: optional/);
  assert.match(systemText, /recentQuestionCount/);
  assert.match(systemText, /質問なしの自然な返答/);
  assert.match(systemText, /天気や写真/);
  assert.match(systemText, /FR-IC/);
  assert.match(systemText, /decisionOwnership: user/);
  assert.match(systemText, /未観測の項目を埋めるために質問してはいけません/);

  assert.match(systemText, /次に話すこと、話を続けること、行動することをATOMが決定しない/);
});

