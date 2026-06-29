export type RiskLevel = "none" | "watch" | "urgent";

export type EmotionLabel =
  | "lonely"
  | "sad"
  | "anxious"
  | "positive"
  | "reminiscence"
  | "neutral";

export type ChatRole = "user" | "assistant";

export type StorageMode = "memory" | "database";

export type AiMode = "mock" | "openai";

export type StoredChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  emotionLabel: EmotionLabel | null;
  riskLevel: RiskLevel;
  createdAt: Date;
};

export type MetricsSummary = {
  date: string;
  conversationCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  userCharCount: number;
  estimatedMinutes: number;
  latestMoodScore: number | null;
  riskWatchCount: number;
  riskUrgentCount: number;
  storageMode: StorageMode;
  aiMode: AiMode;
};

export const DEMO_PROFILE_ID = "demo-profile";
export const RECENT_MESSAGE_LIMIT = 20;
