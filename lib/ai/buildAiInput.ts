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
}: {
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  recentAssistantReplies: string[];
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
    "",
    "# 必ず守ること",
    "- mainFocus がある場合、まずその具体語に自然に反応してください。",
    "- eventType と topicType を使い、話した相手・行った場所・食べた物・聞いた話題などの文脈に合わせてください。",
    "- 感情確認だけで返さず、出てきた人物・場所・食べ物・趣味・物・出来事を雑談として扱ってください。",
    "- shouldAskQuestion が false の場合は質問で終わらないでください。",
    "- 質問する場合も、一度に一つだけにしてください。",
    "- 「印象に残ったことは？」「その時はどんな感じでしたか？」のような汎用質問は禁止です。",
    "- talked_with/person の時は、相手との会話そのものに反応し、質問するなら「何の話で盛り上がったんですか？」のような自然な雑談にしてください。",
    "- is_trending の時は、流行している具体語に反応し、感情確認へ逃げないでください。",
    "- 返答は1〜2文を基本にしてください。",
  ];

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
}: {
  messages: StoredChatMessage[];
  userMessage: string;
  turnPlan: ConversationTurnPlan;
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
