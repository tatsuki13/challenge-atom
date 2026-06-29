import type { ResponseInputItem } from "openai/resources/responses/responses";
import { RECENT_MESSAGE_LIMIT, type StoredChatMessage } from "../conversationTypes";
import {
  getRecentAssistantReplies,
  type ConversationTurnPlan,
} from "./conversationEngine";
import { SYSTEM_PROMPT } from "./systemPrompt";

function clipForPrompt(text: string, maxLength = 180) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildTurnPlanInstruction({
  userMessage,
  turnPlan,
  recentAssistantReplies,
  topicStarter,
  topicTitle,
}: {
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  recentAssistantReplies: string[];
  topicStarter: boolean;
  topicTitle: string | null;
}) {
  const lines = [
    "# 今回の返答方針",
    `- userMessage: ${clipForPrompt(userMessage)}`,
    `- safetyLevel: ${turnPlan.safetyLevel}`,
    `- mode: ${turnPlan.mode}`,
    `- focusTerms: ${turnPlan.focusTerms.length > 0 ? turnPlan.focusTerms.join("、") : "なし"}`,
    `- mainFocus: ${turnPlan.mainFocus ?? "なし"}`,
    `- eventType: ${turnPlan.eventType}`,
    `- topicType: ${turnPlan.topicType}`,
    `- relationHint: ${turnPlan.relationHint ?? "なし"}`,
    `- responseGoal: ${turnPlan.responseGoal}`,
    `- shouldAskQuestion: ${turnPlan.shouldAskQuestion ? "true" : "false"}`,
    `- topicStarter: ${topicStarter ? "true" : "false"}`,
    `- topicTitle: ${topicTitle ?? "なし"}`,
    "",
    "# 必ず守ること",
    "- mainFocus がある場合、まずその具体語に自然に反応してください。",
    "- mainFocus がない場合でも、userMessage の中からいちばん会話が広がりそうな具体語を一つ選び、その言葉に反応してください。",
    "- eventType と topicType を使い、話した相手・行った場所・食べた物・聞いた話題などの文脈に合わせてください。",
    "- eventType が unknown でも、相づちだけで終えず、mainFocus について雑談を一言だけ足してください。",
    "- 感情確認だけで返さず、出てきた人物・場所・食べ物・趣味・物・出来事を雑談として扱ってください。",
    "- 「そうなんですね」「なるほど」「聞いています」だけで返答を終えないでください。",
    "- shouldAskQuestion が false の場合は質問で終わらないでください。",
    "- 質問する場合も、一度に一つだけにしてください。",
    "- 「印象に残ったことは？」「その時はどんな感じでしたか？」のような汎用質問は禁止です。",
    "- talked_with/person の時は、相手との会話そのものに反応し、質問するなら「何の話で盛り上がったんですか？」のような自然な雑談にしてください。",
    "- is_trending の時は、流行している具体語に反応し、感情確認へ逃げないでください。",
    "- 返答は1〜2文を基本にしてください。",
  ];

  if (topicStarter) {
    lines.push(
      "",
      "# 今日の話題ボタンから始まった会話",
      "- これは利用者が話題ボタンを押して始めた会話です。",
      "- 「それでは今回はこの話題でお話ししましょう。」に近い自然な一言から始めてください。",
      "- topicTitle に自然に触れ、利用者が答えやすい一問を一つだけ添えてください。",
      "- ただし、面接や評価のような聞き方にはしないでください。",
    );
  }

  if (turnPlan.avoidPatterns.length > 0) {
    lines.push("", "# 避けること");
    turnPlan.avoidPatterns.forEach((pattern) => {
      lines.push(`- ${pattern}`);
    });
  }

  if (recentAssistantReplies.length > 0) {
    lines.push("", "# 直近3件のAI返答");
    recentAssistantReplies.forEach((reply, index) => {
      lines.push(`- ${index + 1}: ${clipForPrompt(reply, 90)}`);
    });
    lines.push("- 同じ出だしや同じ質問を続けないでください。");
  }

  return lines.join("\n");
}

export function buildAiInput({
  messages,
  userMessage,
  turnPlan,
  topicStarter = false,
  topicTitle = null,
}: {
  messages: StoredChatMessage[];
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  topicStarter?: boolean;
  topicTitle?: string | null;
}) {
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT);
  const recentAssistantReplies = getRecentAssistantReplies(recentMessages);
  const input: ResponseInputItem[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "system",
      content: buildTurnPlanInstruction({
        userMessage,
        turnPlan,
        recentAssistantReplies,
        topicStarter,
        topicTitle,
      }),
    },
    ...recentMessages.map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";

      return {
        role,
        content: message.content,
      } satisfies ResponseInputItem;
    }),
  ];

  return input;
}
