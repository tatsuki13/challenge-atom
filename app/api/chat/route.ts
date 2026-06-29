import OpenAI from "openai";
import { buildAiInput } from "@/lib/ai/buildAiInput";
import {
  analyzeConversationTurn,
  getRecentAssistantReplies,
  type ConversationMode,
  type EventType,
  type ResponseGoal,
  type TopicType,
  type ConversationTurnPlan,
} from "@/lib/ai/conversationEngine";
import { createMockReply } from "@/lib/ai/mockReply";
import { estimateEmotion } from "@/lib/emotion";
import {
  recordAssistantMessage,
  recordUserMessage,
} from "@/lib/conversationStore";
import {
  type RiskLevel,
  type StoredChatMessage,
} from "@/lib/conversationTypes";
import { detectRisk } from "@/lib/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const conversationModes = new Set<ConversationMode>([
  "casual",
  "reminiscence",
  "loneliness",
  "anxiety",
  "daily_life",
  "continuation",
  "safety",
]);

const eventTypes = new Set<EventType>([
  "talked_with",
  "met",
  "went_to",
  "ate",
  "saw",
  "made",
  "heard_about",
  "is_trending",
  "remembered",
  "felt",
  "unknown",
]);

const topicTypes = new Set<TopicType>([
  "person",
  "place",
  "food",
  "activity",
  "object",
  "memory",
  "feeling",
  "unknown",
]);

const responseGoals = new Set<ResponseGoal>([
  "react",
  "chat",
  "continue",
  "ask",
  "reminisce",
  "empathize",
  "safety",
]);

type PlanSource = "local" | "openai";

type AiPlanPatch = Partial<
  Pick<
    ConversationTurnPlan,
    | "mode"
    | "focusTerms"
    | "mainFocus"
    | "eventType"
    | "relationHint"
    | "topicType"
    | "responseGoal"
    | "shouldAskQuestion"
    | "suggestedQuestion"
  >
>;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function normalizeMoodScore(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= 1 && value <= 5 ? value : null;
}

function clipForInternalPrompt(text: string, maxLength = 240) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeText(value: unknown, maxLength = 40) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.replace(/\s+/g, " ").trim();

  return text.length > 0 ? text.slice(0, maxLength) : null;
}

function sanitizeTerms(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const terms: string[] = [];

  for (const item of value) {
    const term = sanitizeText(item, 32);

    if (!term || seen.has(term)) {
      continue;
    }

    seen.add(term);
    terms.push(term);
  }

  return terms.slice(0, 6);
}

function pickEnum<T extends string>(value: unknown, allowed: Set<T>) {
  return typeof value === "string" && allowed.has(value as T)
    ? (value as T)
    : null;
}

function parseJsonObject(text: string) {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as Record<string, unknown>;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");

    if (start < 0 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(withoutFence.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }
}

function normalizeAiPlanPatch(text: string): AiPlanPatch | null {
  const parsed = parseJsonObject(text);

  if (!parsed) {
    return null;
  }

  const focusTerms = sanitizeTerms(parsed.focusTerms);
  const mainFocus = sanitizeText(parsed.mainFocus, 32);
  const suggestedQuestion = sanitizeText(parsed.suggestedQuestion, 80);
  const relationHint = sanitizeText(parsed.relationHint, 40);
  const patch: AiPlanPatch = {};
  const mode = pickEnum(parsed.mode, conversationModes);
  const eventType = pickEnum(parsed.eventType, eventTypes);
  const topicType = pickEnum(parsed.topicType, topicTypes);
  const responseGoal = pickEnum(parsed.responseGoal, responseGoals);

  if (mode) {
    patch.mode = mode;
  }

  if (focusTerms.length > 0) {
    patch.focusTerms = focusTerms;
  }

  if (mainFocus) {
    patch.mainFocus = mainFocus;
  }

  if (eventType) {
    patch.eventType = eventType;
  }

  if (topicType) {
    patch.topicType = topicType;
  }

  if (responseGoal) {
    patch.responseGoal = responseGoal;
  }

  if (relationHint) {
    patch.relationHint = relationHint;
  }

  if (typeof parsed.shouldAskQuestion === "boolean") {
    patch.shouldAskQuestion = parsed.shouldAskQuestion;
  }

  if (suggestedQuestion) {
    patch.suggestedQuestion = suggestedQuestion;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function mergeAiPlanPatch(
  localPlan: ConversationTurnPlan,
  patch: AiPlanPatch | null,
): ConversationTurnPlan {
  if (!patch) {
    return localPlan;
  }

  const mainFocus = patch.mainFocus ?? localPlan.mainFocus;
  const focusTerms = [
    ...(mainFocus ? [mainFocus] : []),
    ...(patch.focusTerms ?? []),
    ...localPlan.focusTerms,
  ].filter((term, index, terms) => terms.indexOf(term) === index);
  const shouldAskQuestion =
    localPlan.safetyLevel === "urgent"
      ? false
      : (patch.shouldAskQuestion ?? localPlan.shouldAskQuestion);

  return {
    ...localPlan,
    mode: localPlan.safetyLevel === "urgent"
      ? "safety"
      : (patch.mode ?? localPlan.mode),
    focusTerms: focusTerms.slice(0, 6),
    mainFocus,
    eventType: patch.eventType ?? localPlan.eventType,
    relationHint: patch.relationHint ?? localPlan.relationHint,
    topicType: patch.topicType ?? localPlan.topicType,
    responseGoal: localPlan.safetyLevel === "urgent"
      ? "safety"
      : (patch.responseGoal ?? localPlan.responseGoal),
    shouldAskQuestion,
    suggestedQuestion: shouldAskQuestion
      ? (patch.suggestedQuestion ?? localPlan.suggestedQuestion ?? null)
      : null,
  };
}

async function createOpenAIPlanPatch({
  messages,
  userMessage,
  localPlan,
  topicStarter,
  topicTitle,
}: {
  messages: StoredChatMessage[];
  userMessage: string;
  localPlan: ConversationTurnPlan;
  topicStarter: boolean;
  topicTitle: string | null;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  const client = new OpenAI({ apiKey });
  const recentMessages = messages.slice(-8).map((message) => ({
    role: message.role,
    content: clipForInternalPrompt(message.content, 160),
  }));
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "You analyze one Japanese conversation turn for a friendly elderly-care chat partner.",
          "Return only one JSON object. Do not include markdown.",
          "Pick the most conversation-worthy concrete term, not just a feeling word.",
          "Prefer a natural follow-up question when it would help the conversation continue.",
          "Never make medical diagnosis. Safety remains handled elsewhere.",
          'Allowed mode: casual, reminiscence, loneliness, anxiety, daily_life, continuation, safety.',
          'Allowed eventType: talked_with, met, went_to, ate, saw, made, heard_about, is_trending, remembered, felt, unknown.',
          'Allowed topicType: person, place, food, activity, object, memory, feeling, unknown.',
          'Allowed responseGoal: react, chat, continue, ask, reminisce, empathize, safety.',
          "JSON keys: mode, focusTerms, mainFocus, eventType, topicType, relationHint, responseGoal, shouldAskQuestion, suggestedQuestion.",
          "suggestedQuestion must be a short natural Japanese question, not a generic interview question.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          userMessage,
          topicStarter,
          topicTitle,
          localPlan,
          recentMessages,
        }),
      },
    ],
    store: false,
  });

  return normalizeAiPlanPatch(response.output_text);
}

async function createOpenAIReply({
  messages,
  userMessage,
  turnPlan,
  topicStarter,
  topicTitle,
}: {
  messages: StoredChatMessage[];
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  topicStarter: boolean;
  topicTitle: string | null;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  const client = new OpenAI({ apiKey });
  const input = buildAiInput({
    messages,
    userMessage,
    turnPlan,
    topicStarter,
    topicTitle,
  });

  const response = await client.responses.create({
    model,
    input,
    store: false,
  });

  return response.output_text.trim() || null;
}

export async function POST(request: Request) {
  let body: {
    message?: unknown;
    conversationId?: unknown;
    moodScore?: unknown;
    speechEnabled?: unknown;
    topicStarter?: unknown;
    topicTitle?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSONの形式を確認してください。" }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.length <= 120
      ? body.conversationId
      : undefined;
  const moodScore = normalizeMoodScore(body.moodScore);
  const topicStarter = body.topicStarter === true;
  const topicTitle =
    typeof body.topicTitle === "string" && body.topicTitle.length <= 120
      ? body.topicTitle.trim()
      : null;

  if (!message) {
    return jsonResponse({ error: "メッセージを入力してください。" }, 400);
  }

  if (message.length > 1000) {
    return jsonResponse(
      { error: "一度に送れる文章は1000文字までです。" },
      400,
    );
  }

  const riskLevel: RiskLevel = detectRisk(message);
  const emotionLabel = estimateEmotion(message);
  const savedUserMessage = await recordUserMessage({
    conversationId,
    message,
    moodScore,
    emotionLabel,
    riskLevel,
  });
  const turnPlan = analyzeConversationTurn({
    userMessage: message,
    recentMessages: savedUserMessage.recentMessages,
    recentAssistantReplies: getRecentAssistantReplies(
      savedUserMessage.recentMessages,
    ),
    safetyResult: riskLevel,
  });
  let finalTurnPlan = turnPlan;
  let planSource: PlanSource = "local";

  let reply: string | null = null;
  let usedMock = true;

  if (riskLevel !== "urgent") {
    try {
      const aiPlanPatch = await createOpenAIPlanPatch({
        messages: savedUserMessage.recentMessages,
        userMessage: message,
        localPlan: turnPlan,
        topicStarter,
        topicTitle,
      });

      if (aiPlanPatch) {
        finalTurnPlan = mergeAiPlanPatch(turnPlan, aiPlanPatch);
        planSource = "openai";
      }
    } catch {
      finalTurnPlan = turnPlan;
      planSource = "local";
    }

    try {
      reply = await createOpenAIReply({
        messages: savedUserMessage.recentMessages,
        userMessage: message,
        turnPlan: finalTurnPlan,
        topicStarter,
        topicTitle,
      });
      usedMock = reply === null;
    } catch {
      console.warn("OpenAI response failed; using mock reply.");
      reply = null;
      usedMock = true;
    }
  }

  reply ??= createMockReply({
    userMessage: message,
    turnPlan: finalTurnPlan,
    recentMessages: savedUserMessage.recentMessages,
    topicStarter,
    topicTitle,
  });

  await recordAssistantMessage({
    conversationId: savedUserMessage.conversationId,
    reply,
    emotionLabel,
    riskLevel,
    storageMode: savedUserMessage.storageMode,
  });

  return jsonResponse({
    reply,
    conversationId: savedUserMessage.conversationId,
    emotionLabel,
    riskLevel,
    usedMock,
    debug: {
      usedMock,
      planSource,
      mode: finalTurnPlan.mode,
      mainFocus: finalTurnPlan.mainFocus,
      focusTerms: finalTurnPlan.focusTerms,
      eventType: finalTurnPlan.eventType,
      topicType: finalTurnPlan.topicType,
      responseGoal: finalTurnPlan.responseGoal,
      shouldAskQuestion: finalTurnPlan.shouldAskQuestion,
      suggestedQuestion: finalTurnPlan.suggestedQuestion ?? null,
      topicStarter,
    },
  });
}
