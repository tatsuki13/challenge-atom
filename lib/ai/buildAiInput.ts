import type { ResponseInputItem } from "openai/resources/responses/responses";
import { RECENT_MESSAGE_LIMIT, type StoredChatMessage } from "../conversationTypes";
import {
  buildAdaptiveGuidance,
  type ConversationMemoryContext,
} from "./adaptiveGuidance";
import { CONVERSATION_POLICY } from "./conversationPolicy";
import {
  buildConversationModeInstruction,
  type ConversationMode,
} from "./conversationMode";
import { buildReplyStyleInstruction } from "./replyStyle";
import { SYSTEM_PROMPT } from "./systemPrompt";

function formatList(values: string[]) {
  return values.length > 0 ? values.join("、") : "まだ十分に分かっていません";
}

function buildRecentContextBlock({
  mode,
  memoryContext,
}: {
  mode: ConversationMode;
  memoryContext: ConversationMemoryContext | null;
}) {
  const lines = [
    "# 直近コンテキスト整理",
    `- 判定された会話モード: ${mode}`,
    "- この整理は内部参考です。利用者に分類名や分析として伝えないでください。",
  ];

  if (!memoryContext) {
    lines.push("- userMemory: まだ十分にありません。");
    return lines.join("\n");
  }

  lines.push(
    `- 好きそうな話題・よく出る話題: ${formatList(memoryContext.topTopics)}`,
    `- 最近出た人物: ${formatList(memoryContext.recentPeople)}`,
    `- よく出る場所: ${formatList(memoryContext.frequentPlaces)}`,
    `- 繰り返し出る悩み: ${formatList(memoryContext.recurringConcerns)}`,
    `- 直近で触れた生活要素: ${formatList(memoryContext.coveredAreas)}`,
  );

  if (memoryContext.moodSummary) {
    lines.push(`- 気分傾向: ${memoryContext.moodSummary}`);
  }

  if (memoryContext.emotionSummary) {
    lines.push(`- 感情傾向: ${memoryContext.emotionSummary}`);
  }

  if (memoryContext.recentUserNotes.length > 0) {
    lines.push(`- 直近の本人発話: ${memoryContext.recentUserNotes.join(" / ")}`);
  }

  return lines.join("\n");
}

export function buildAiInput({
  messages,
  moodScore,
  memoryContext,
  mode,
}: {
  messages: StoredChatMessage[];
  moodScore: number | null;
  memoryContext: ConversationMemoryContext | null;
  mode: ConversationMode;
}) {
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT);
  const input: ResponseInputItem[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "system",
      content: CONVERSATION_POLICY,
    },
    {
      role: "system",
      content: buildConversationModeInstruction(mode),
    },
    {
      role: "system",
      content: buildAdaptiveGuidance({ moodScore, memoryContext }),
    },
    {
      role: "system",
      content: buildReplyStyleInstruction({ mode, recentMessages }),
    },
    {
      role: "system",
      content: buildRecentContextBlock({ mode, memoryContext }),
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
