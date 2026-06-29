import type { ResponseInputItem } from "openai/resources/responses/responses";
import { RECENT_MESSAGE_LIMIT, type StoredChatMessage } from "../conversationTypes";
import { CONVERSATION_POLICY } from "./conversationPolicy";
import { SYSTEM_PROMPT } from "./systemPrompt";

export function buildAiInput({ messages }: { messages: StoredChatMessage[] }) {
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
