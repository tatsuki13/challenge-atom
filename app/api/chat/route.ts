import OpenAI from "openai";
import { buildAiInput } from "@/lib/ai/buildAiInput";
import {
  analyzeConversationTurn,
  getRecentAssistantReplies,
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

  let reply: string | null = null;
  let usedMock = true;

  if (riskLevel !== "urgent") {
    try {
      reply = await createOpenAIReply({
        messages: savedUserMessage.recentMessages,
        userMessage: message,
        turnPlan,
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
    turnPlan,
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
      mode: turnPlan.mode,
      mainFocus: turnPlan.mainFocus,
      focusTerms: turnPlan.focusTerms,
      eventType: turnPlan.eventType,
      topicType: turnPlan.topicType,
      responseGoal: turnPlan.responseGoal,
      shouldAskQuestion: turnPlan.shouldAskQuestion,
      topicStarter,
    },
  });
}
