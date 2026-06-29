import type { StoredChatMessage } from "../conversationTypes";
import type { ConversationMode } from "./conversationMode";

export type ReplyStyle =
  | "aizuchi_expand_question"
  | "empathy_continue"
  | "concrete_chat"
  | "memory_question"
  | "short_no_question";

const styleInstructions: Record<ReplyStyle, string> = {
  aizuchi_expand_question:
    "相づちを短く入れ、相手の言葉を少しだけ広げて、一つだけ自然に聞く。",
  empathy_continue:
    "感情を決めつけずに受け止め、質問を急がず、必要なら続きを促す。",
  concrete_chat:
    "出てきた具体物に反応し、軽い雑談として広げる。生活チェックに見せない。",
  memory_question:
    "思い出や本人らしさを拾い、昔の景色、好きだったこと、大切だったことへ一つだけ広げる。",
  short_no_question:
    "質問せず、短い受け止めや安全確保を優先する。長く説明しない。",
};

const stylesByMode: Record<ConversationMode, ReplyStyle[]> = {
  casual: ["concrete_chat", "aizuchi_expand_question", "short_no_question"],
  reminiscence: ["memory_question", "empathy_continue", "concrete_chat"],
  loneliness: ["empathy_continue", "short_no_question", "aizuchi_expand_question"],
  anxiety: ["empathy_continue", "aizuchi_expand_question", "short_no_question"],
  daily_life: ["concrete_chat", "aizuchi_expand_question", "short_no_question"],
  continuation: ["empathy_continue", "short_no_question"],
  safety: ["short_no_question"],
};

function getAssistantMessages(messages: StoredChatMessage[]) {
  return messages.filter((message) => message.role === "assistant");
}

export function getRecentAssistantOpeners(messages: StoredChatMessage[]) {
  return getAssistantMessages(messages)
    .slice(-3)
    .map((message) => message.content.replace(/\s+/g, " ").trim().slice(0, 14))
    .filter(Boolean);
}

export function selectReplyStyle({
  mode,
  recentMessages,
}: {
  mode: ConversationMode;
  recentMessages: StoredChatMessage[];
}) {
  const styles = stylesByMode[mode];
  const assistantCount = getAssistantMessages(recentMessages).length;

  return styles[assistantCount % styles.length] ?? styles[0];
}

export function buildReplyStyleInstruction({
  mode,
  recentMessages,
}: {
  mode: ConversationMode;
  recentMessages: StoredChatMessage[];
}) {
  const style = selectReplyStyle({ mode, recentMessages });
  const recentOpeners = getRecentAssistantOpeners(recentMessages);
  const lines = [
    "# 今回の返答スタイル",
    `- 使用する型: ${style}`,
    `- 方針: ${styleInstructions[style]}`,
    "- 毎回「そうでしたか。〇〇だったんですね。△△ですか？」の型にしない。",
    "- 必ず質問で終える必要はありません。",
  ];

  if (recentOpeners.length > 0) {
    lines.push(
      `- 直近のAI返答の出だし: ${recentOpeners.join(" / ")}`,
      "- 上の出だしと同じ始まり方を避けてください。",
    );
  }

  return lines.join("\n");
}
