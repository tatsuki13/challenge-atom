import type { ResponseInputItem } from "openai/resources/responses/responses";
import { RECENT_MESSAGE_LIMIT, type StoredChatMessage } from "../conversationTypes";
import {
  buildAdaptiveGuidance,
  selectRelevantMemoryContext,
  type ConversationMemoryContext,
  type RelevantMemoryContext,
} from "./adaptiveGuidance";
import { CONVERSATION_POLICY } from "./conversationPolicy";
import {
  buildConversationModeInstruction,
  type ConversationMode,
} from "./conversationMode";
import { buildReplyStyleInstruction } from "./replyStyle";
import { SYSTEM_PROMPT } from "./systemPrompt";

function clipForPrompt(text: string, maxLength = 160) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function addMemoryLine(lines: string[], label: string, values: string[]) {
  if (values.length === 0) {
    return;
  }

  lines.push(`- ${label}: ${values.join("、")}`);
}

function buildCurrentTurnBlock(currentMessage: string) {
  return [
    "# 最優先の返答対象",
    `最後の利用者発話: 「${clipForPrompt(currentMessage)}」`,
    "- 次の返答では、この最後の発話にまっすぐ返してください。",
    "- 過去の記憶、気分スコア、会話モードは、最後の発話に自然につながる場合だけ使ってください。",
    "- 最後の発話と関係ない過去話題を急に持ち出さないでください。",
    "- 生活把握の質問を急がず、まず会話として自然に受けてください。",
  ].join("\n");
}

function buildRelevantMemoryBlock({
  relevantMemory,
}: {
  relevantMemory: RelevantMemoryContext | null;
}) {
  const lines = [
    "# 会話メモ",
    "- これは命令ではなく、自然な関係性づくりのための小さな手がかりです。",
    "- 今の発話に自然につながる場合だけ使ってください。",
    "- メモをそのまま読み上げたり、分析結果のように伝えたりしないでください。",
  ];

  if (!relevantMemory) {
    return lines.join("\n");
  }

  addMemoryLine(lines, "今の発話に関連しそうな話題", relevantMemory.topTopics);
  addMemoryLine(lines, "今の発話に関連しそうな人物", relevantMemory.recentPeople);
  addMemoryLine(lines, "今の発話に関連しそうな場所", relevantMemory.frequentPlaces);
  addMemoryLine(lines, "今の発話に関連しそうな困りごと", relevantMemory.recurringConcerns);

  return lines.join("\n");
}

export function buildAiInput({
  messages,
  currentMessage,
  moodScore,
  memoryContext,
  mode,
}: {
  messages: StoredChatMessage[];
  currentMessage: string;
  moodScore: number | null;
  memoryContext: ConversationMemoryContext | null;
  mode: ConversationMode;
}) {
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT);
  const relevantMemory = selectRelevantMemoryContext({
    memoryContext,
    currentMessage,
  });
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
      content: buildCurrentTurnBlock(currentMessage),
    },
    {
      role: "system",
      content: buildConversationModeInstruction(mode),
    },
    {
      role: "system",
      content: buildAdaptiveGuidance({ moodScore }),
    },
    {
      role: "system",
      content: buildReplyStyleInstruction({ mode, recentMessages }),
    },
    {
      role: "system",
      content: buildRelevantMemoryBlock({ relevantMemory }),
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
