import { getTokyoDateKey } from "./date";
import {
  DEMO_PROFILE_ID,
  RECENT_MESSAGE_LIMIT,
  type ChatRole,
  type EmotionLabel,
  type MetricsSummary,
  type RiskLevel,
  type StoredChatMessage,
} from "./conversationTypes";

type DemoConversation = {
  id: string;
  profileId: string;
  title: string;
  moodScoreStart: number | null;
  moodScoreEnd: number | null;
  startedAt: Date;
  endedAt: Date | null;
  messages: StoredChatMessage[];
};

type DemoRiskEvent = {
  id: string;
  profileId: string;
  conversationId: string;
  riskLevel: RiskLevel;
  createdAt: Date;
};

type DemoState = {
  conversations: Map<string, DemoConversation>;
  riskEvents: DemoRiskEvent[];
};

declare global {
  var __challengeAtomDemoStore: DemoState | undefined;
}

function getState() {
  if (!globalThis.__challengeAtomDemoStore) {
    globalThis.__challengeAtomDemoStore = {
      conversations: new Map(),
      riskEvents: [],
    };
  }

  return globalThis.__challengeAtomDemoStore;
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function ensureConversation({
  conversationId,
  message,
  moodScore,
}: {
  conversationId?: string;
  message: string;
  moodScore: number | null;
}) {
  const state = getState();
  const existing = conversationId
    ? state.conversations.get(conversationId)
    : undefined;

  if (existing) {
    existing.moodScoreEnd = moodScore ?? existing.moodScoreEnd;
    return existing;
  }

  const id = conversationId || createId("conv");
  const conversation: DemoConversation = {
    id,
    profileId: DEMO_PROFILE_ID,
    title: message.slice(0, 24) || "今日の会話",
    moodScoreStart: moodScore,
    moodScoreEnd: moodScore,
    startedAt: new Date(),
    endedAt: null,
    messages: [],
  };

  state.conversations.set(id, conversation);
  return conversation;
}

function createMessage({
  conversationId,
  role,
  content,
  emotionLabel,
  riskLevel,
}: {
  conversationId: string;
  role: ChatRole;
  content: string;
  emotionLabel: EmotionLabel | null;
  riskLevel: RiskLevel;
}): StoredChatMessage {
  return {
    id: createId("msg"),
    conversationId,
    role,
    content,
    emotionLabel,
    riskLevel,
    createdAt: new Date(),
  };
}

export function recordDemoUserMessage({
  conversationId,
  message,
  moodScore,
  emotionLabel,
  riskLevel,
}: {
  conversationId?: string;
  message: string;
  moodScore: number | null;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
}) {
  const state = getState();
  const conversation = ensureConversation({ conversationId, message, moodScore });
  const storedMessage = createMessage({
    conversationId: conversation.id,
    role: "user",
    content: message,
    emotionLabel,
    riskLevel,
  });

  conversation.messages.push(storedMessage);

  if (riskLevel !== "none") {
    state.riskEvents.push({
      id: createId("risk"),
      profileId: DEMO_PROFILE_ID,
      conversationId: conversation.id,
      riskLevel,
      createdAt: new Date(),
    });
  }

  return {
    conversationId: conversation.id,
    recentMessages: conversation.messages.slice(-RECENT_MESSAGE_LIMIT),
    storageMode: "memory" as const,
  };
}

export function recordDemoAssistantMessage({
  conversationId,
  reply,
  emotionLabel,
  riskLevel,
}: {
  conversationId: string;
  reply: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
}) {
  const conversation = ensureConversation({
    conversationId,
    message: "今日の会話",
    moodScore: null,
  });
  const storedMessage = createMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: reply,
    emotionLabel,
    riskLevel,
  });

  conversation.messages.push(storedMessage);
  return storedMessage;
}

export function getDemoMetrics(): MetricsSummary {
  const state = getState();
  const today = getTokyoDateKey();
  const conversations = [...state.conversations.values()].filter(
    (conversation) => getTokyoDateKey(conversation.startedAt) === today,
  );
  const messages = conversations.flatMap((conversation) => conversation.messages);
  const latestConversation = conversations
    .slice()
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  const riskEvents = state.riskEvents.filter(
    (event) => getTokyoDateKey(event.createdAt) === today,
  );
  const userMessages = messages.filter((message) => message.role === "user");
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );

  return {
    date: today,
    conversationCount: conversations.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    userCharCount: userMessages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
    estimatedMinutes: Math.max(
      0,
      Math.ceil((userMessages.length + assistantMessages.length) * 0.75),
    ),
    latestMoodScore:
      latestConversation?.moodScoreEnd ?? latestConversation?.moodScoreStart ?? null,
    riskWatchCount: riskEvents.filter((event) => event.riskLevel === "watch")
      .length,
    riskUrgentCount: riskEvents.filter((event) => event.riskLevel === "urgent")
      .length,
    storageMode: "memory",
    aiMode:
      process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "openai" : "mock",
  };
}
