import type { ExtractedMemoryCandidate, StoredChatMessage } from "../conversationTypes";

export type MemoryConfirmationReply = "confirmed" | "rejected" | "unclear";

export type PendingMemoryConfirmation = {
  proposedContent: string;
  sourceMessageId: string;
  sourceMessageContent: string;
};

const confirmationQuestionPattern =
  /^「(.+)」ということですね。今後の会話のために覚えておいてもよいですか[？?]$/;

const rejectionPattern =
  /^(?:いいえ|いえ|いや|だめ|駄目|違います|そうではありません|覚えないで|記憶しないで)/;
const confirmationPattern =
  /^(?:はい|ええ|うん|そうです|その通りです|合っています|お願いします|いいですよ|構いません|覚えておいて(?:ください)?|覚えてください)(?:[、,。.!！]|$)/;

function normalizeReply(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function classifyMemoryConfirmationReply(text: string): MemoryConfirmationReply {
  const normalized = normalizeReply(text);
  if (rejectionPattern.test(normalized)) return "rejected";
  if (confirmationPattern.test(normalized)) return "confirmed";
  return "unclear";
}

export function createMemoryConfirmationQuestion(candidate: ExtractedMemoryCandidate) {
  const content = candidate.content.replace(/[「」]/g, "").trim();
  return `「${content}」ということですね。今後の会話のために覚えておいてもよいですか？`;
}

export function findPendingMemoryConfirmation(
  messages: StoredChatMessage[],
): PendingMemoryConfirmation | null {
  const currentUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (currentUserIndex < 2) return null;

  const assistantMessage = messages[currentUserIndex - 1];
  const sourceMessage = messages[currentUserIndex - 2];
  if (assistantMessage?.role !== "assistant" || sourceMessage?.role !== "user") return null;

  const match = normalizeReply(assistantMessage.content).match(confirmationQuestionPattern);
  if (!match) return null;

  return {
    proposedContent: match[1],
    sourceMessageId: sourceMessage.id,
    sourceMessageContent: sourceMessage.content,
  };
}
