import type { RiskLevel, StoredChatMessage } from "../conversationTypes";

export type ConversationMode =
  | "casual"
  | "reminiscence"
  | "loneliness"
  | "anxiety"
  | "daily_life"
  | "continuation"
  | "safety";

export type ConversationIntent =
  | "enjoy_chat"
  | "empathize"
  | "invite_more"
  | "ask_one_question"
  | "reminisce"
  | "gently_check_life"
  | "safety_response";

export type ReplyPattern =
  | "small_talk_only"
  | "empathy_only"
  | "empathy_plus_question"
  | "concrete_reaction_plus_question"
  | "continue_prompt"
  | "reminiscence_prompt"
  | "safety_guidance";

export type EmotionalTone =
  | "warm"
  | "light"
  | "gentle"
  | "nostalgic"
  | "steady"
  | "urgent";

export type SafetyLevel = "none" | "watch" | "urgent";

export type ConversationPlan = {
  mode: ConversationMode;
  intent: ConversationIntent;
  shouldAskQuestion: boolean;
  replyPattern: ReplyPattern;
  emotionalTone: EmotionalTone;
  avoidTopics: string[];
  safetyLevel: SafetyLevel;
};

const reminiscenceTerms = [
  "昔",
  "若い頃",
  "若いころ",
  "思い出",
  "仕事していた頃",
  "畑",
  "学校",
  "懐かしい",
  "子どものころ",
];

const lonelinessTerms = [
  "寂しい",
  "さびしい",
  "ひとり",
  "一人",
  "誰とも話していない",
  "誰とも話してない",
  "孤独",
  "誰にも会わない",
];

const anxietyTerms = [
  "不安",
  "心配",
  "眠れない",
  "気になる",
  "怖い",
  "こわい",
  "落ち着かない",
];

const dailyLifeTerms = [
  "食べた",
  "寝た",
  "散歩",
  "買い物",
  "病院",
  "疲れた",
  "スーパー",
  "ご飯",
  "掃除",
  "洗濯",
  "体調",
];

const safetyTerms = [
  "死にたい",
  "消えたい",
  "自殺",
  "もう生きたくない",
  "息が苦しい",
  "胸が痛い",
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function getAssistantMessages(messages: StoredChatMessage[]) {
  return messages.filter((message) => message.role === "assistant");
}

export function getRecentAssistantOpeners(messages: StoredChatMessage[]) {
  return getAssistantMessages(messages)
    .slice(-3)
    .map((message) => message.content.replace(/\s+/g, " ").trim().slice(0, 12))
    .filter(Boolean);
}

function looksLikeContinuation(text: string, recentMessages: StoredChatMessage[]) {
  const normalized = text.trim();
  const lastAssistant = recentMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  const assistantAskedQuestion = Boolean(lastAssistant?.content.includes("？"));

  return (
    normalized.length >= 90 ||
    /、$|…$|・・・$|\.{3}$/.test(normalized) ||
    /(それで|それから|あと|まだ|続き|というのも)$/.test(normalized) ||
    (assistantAskedQuestion && normalized.length >= 70)
  );
}

function detectMode({
  message,
  riskLevel,
  recentMessages,
}: {
  message: string;
  riskLevel: RiskLevel;
  recentMessages: StoredChatMessage[];
}): ConversationMode {
  if (riskLevel === "urgent" || includesAny(message, safetyTerms)) {
    return "safety";
  }

  if (looksLikeContinuation(message, recentMessages)) {
    return "continuation";
  }

  if (includesAny(message, lonelinessTerms)) {
    return "loneliness";
  }

  if (includesAny(message, anxietyTerms)) {
    return "anxiety";
  }

  if (includesAny(message, reminiscenceTerms)) {
    return "reminiscence";
  }

  if (includesAny(message, dailyLifeTerms)) {
    return "daily_life";
  }

  return "casual";
}

function inferReplyPattern(text: string): ReplyPattern {
  if (text.includes("119") || text.includes("緊急")) {
    return "safety_guidance";
  }

  if (/それで|続き|もう少し聞きたい/.test(text)) {
    return "continue_prompt";
  }

  if (/昔|当時|その頃|懐かしい/.test(text)) {
    return "reminiscence_prompt";
  }

  if (!text.includes("？")) {
    return text.length <= 45 ? "small_talk_only" : "empathy_only";
  }

  if (/どんな|何か|どの|どれ/.test(text)) {
    return "concrete_reaction_plus_question";
  }

  return "empathy_plus_question";
}

function getRecentReplyPatterns(messages: StoredChatMessage[]) {
  return getAssistantMessages(messages).slice(-3).map((message) =>
    inferReplyPattern(message.content),
  );
}

function hasRecentQuestion(messages: StoredChatMessage[]) {
  return getAssistantMessages(messages)
    .slice(-2)
    .some((message) => message.content.includes("？"));
}

function rotatePattern(pattern: ReplyPattern): ReplyPattern {
  const nextPattern: Record<ReplyPattern, ReplyPattern> = {
    small_talk_only: "concrete_reaction_plus_question",
    empathy_only: "continue_prompt",
    empathy_plus_question: "empathy_only",
    concrete_reaction_plus_question: "small_talk_only",
    continue_prompt: "small_talk_only",
    reminiscence_prompt: "empathy_only",
    safety_guidance: "safety_guidance",
  };

  return nextPattern[pattern];
}

function chooseBasePattern({
  mode,
  recentMessages,
}: {
  mode: ConversationMode;
  recentMessages: StoredChatMessage[];
}): ReplyPattern {
  const assistantCount = getAssistantMessages(recentMessages).length;
  const questionRecently = hasRecentQuestion(recentMessages);

  if (mode === "safety") {
    return "safety_guidance";
  }

  if (mode === "continuation") {
    return "continue_prompt";
  }

  if (mode === "reminiscence") {
    return assistantCount % 3 === 0 ? "reminiscence_prompt" : "empathy_only";
  }

  if (mode === "loneliness" || mode === "anxiety") {
    return questionRecently ? "empathy_only" : "empathy_plus_question";
  }

  if (mode === "daily_life") {
    return questionRecently ? "small_talk_only" : "concrete_reaction_plus_question";
  }

  const casualPatterns: ReplyPattern[] = [
    "small_talk_only",
    "concrete_reaction_plus_question",
    "continue_prompt",
    "small_talk_only",
    "empathy_only",
    "reminiscence_prompt",
    "small_talk_only",
    "concrete_reaction_plus_question",
    "small_talk_only",
    "empathy_only",
  ];

  return casualPatterns[assistantCount % casualPatterns.length];
}

function avoidRepeatedPattern({
  pattern,
  recentMessages,
}: {
  pattern: ReplyPattern;
  recentMessages: StoredChatMessage[];
}) {
  const recentPatterns = getRecentReplyPatterns(recentMessages);
  const lastPattern = recentPatterns.at(-1);

  if (pattern === "safety_guidance") {
    return pattern;
  }

  return lastPattern === pattern ? rotatePattern(pattern) : pattern;
}

function intentFromPattern(pattern: ReplyPattern, mode: ConversationMode): ConversationIntent {
  if (pattern === "safety_guidance") {
    return "safety_response";
  }

  if (pattern === "continue_prompt") {
    return "invite_more";
  }

  if (pattern === "reminiscence_prompt" || mode === "reminiscence") {
    return "reminisce";
  }

  if (pattern === "empathy_only" || mode === "loneliness" || mode === "anxiety") {
    return "empathize";
  }

  if (
    pattern === "empathy_plus_question" ||
    pattern === "concrete_reaction_plus_question"
  ) {
    return mode === "daily_life" ? "gently_check_life" : "ask_one_question";
  }

  return "enjoy_chat";
}

function toneFromMode(mode: ConversationMode): EmotionalTone {
  const tones: Record<ConversationMode, EmotionalTone> = {
    casual: "light",
    reminiscence: "nostalgic",
    loneliness: "gentle",
    anxiety: "steady",
    daily_life: "warm",
    continuation: "warm",
    safety: "urgent",
  };

  return tones[mode];
}

function avoidTopicsFromMode(mode: ConversationMode) {
  const common = [
    "診断",
    "説教",
    "生活チェックリスト",
    "急な解決策",
    "評価しているような言い方",
    "具体的な反応のない空返事",
  ];

  if (mode === "loneliness") {
    return [...common, "すぐに外出を勧めること", "すぐに家族連絡を勧めること"];
  }

  if (mode === "daily_life") {
    return [...common, "睡眠・食事・外出を連続で聞くこと"];
  }

  if (mode === "safety") {
    return ["診断", "保証", "長いやり取り", "一人で様子を見るよう促すこと"];
  }

  return common;
}

function safetyLevelFromRisk(riskLevel: RiskLevel): SafetyLevel {
  if (riskLevel === "urgent") {
    return "urgent";
  }

  if (riskLevel === "watch") {
    return "watch";
  }

  return "none";
}

export function planConversationReply({
  message,
  riskLevel,
  recentMessages,
}: {
  message: string;
  riskLevel: RiskLevel;
  recentMessages: StoredChatMessage[];
}): ConversationPlan {
  const mode = detectMode({ message, riskLevel, recentMessages });
  const basePattern = chooseBasePattern({ mode, recentMessages });
  const replyPattern = avoidRepeatedPattern({
    pattern: basePattern,
    recentMessages,
  });
  const shouldAskQuestion =
    replyPattern === "empathy_plus_question" ||
    replyPattern === "concrete_reaction_plus_question" ||
    replyPattern === "reminiscence_prompt";

  return {
    mode,
    intent: intentFromPattern(replyPattern, mode),
    shouldAskQuestion,
    replyPattern,
    emotionalTone: toneFromMode(mode),
    avoidTopics: avoidTopicsFromMode(mode),
    safetyLevel: safetyLevelFromRisk(riskLevel),
  };
}

export function buildPlannerInstruction(plan: ConversationPlan) {
  return [
    "# Conversation Planner",
    `- mode: ${plan.mode}`,
    `- intent: ${plan.intent}`,
    `- shouldAskQuestion: ${plan.shouldAskQuestion ? "true" : "false"}`,
    `- replyPattern: ${plan.replyPattern}`,
    `- emotionalTone: ${plan.emotionalTone}`,
    `- safetyLevel: ${plan.safetyLevel}`,
    `- avoidTopics: ${plan.avoidTopics.join("、")}`,
    "",
    "この計画に従って、自然な日本語で返答してください。",
    "最後の利用者発話への返事を最優先にしてください。",
    "shouldAskQuestion が false の時は質問で終えないでください。",
    "ただし、具体的な反応がない空返事だけで終えないでください。",
    "質問する場合も一度に一つだけにしてください。",
    "replyPattern をそのまま説明しないでください。",
  ].join("\n");
}
