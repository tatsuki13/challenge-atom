import OpenAI from "openai";
import { buildAiInput } from "@/lib/ai/buildAiInput";
import {
  analyzeConversationTurn,
  getRecentAssistantReplies,
  normalizeConversationTurnPlan,
  type ConversationMode,
  type EventType,
  type TopicType,
  type ConversationTurnPlan,
} from "@/lib/ai/conversationEngine";
import { createMockReply } from "@/lib/ai/mockReply";
import {
  createMemoryExtractionResult,
  MAX_MEMORY_CANDIDATES_PER_TURN,
  MEMORY_CANDIDATE_JSON_SCHEMA,
  validateMemoryCandidates,
} from "@/lib/ai/memoryExtraction";
import {
  MEMORY_RETRIEVAL_CONFIG,
  createContinuityFallbackRequest,
  createMemoryRetrievalAuditInput,
  discardSelectedMemoryResults,
  normalizeMemoryRetrievalRequest,
  toMemoryPromptContext,
} from "@/lib/ai/memoryRetrieval";
import { normalizeDetectedMemoryManagementRequest } from "@/lib/ai/memoryManagementDetection";
import { countQuestions, validateReplyAgainstContract } from "@/lib/ai/replyValidation";
import { estimateEmotion } from "@/lib/emotion";
import { getCurrentUser } from "@/lib/auth";
import {
  recordAssistantTurn,
  recordMemoryCandidates,
  recordUserMessage,
} from "@/lib/conversationStore";
import { retrieveConfirmedMemories } from "@/lib/memoryRetrievalService";
import {
  dedupeSourceUtteranceIds,
  isListeningStrategy,
  isMessageInputType,
  type GenerationSource,
  type ExtractedMemoryCandidate,
  type MemoryExtractionResult,
  type MemoryRetrievalFailureReason,
  type MemoryRetrievalMode,
  type MemoryRetrievalRequest,
  type MemoryRetrievalSource,
  type MemoryRetrievalStatus,
  type MemorySearchEvaluation,
  type MemorySearchResult,
  type DetectedMemoryManagementRequest,
  type PlanSource,
  type RiskLevel,
  type ReplyRejectionReason,
  type StoredChatMessage,
} from "@/lib/conversationTypes";
import { detectRisk, getUrgentSafetyReply } from "@/lib/safety";

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

type AiPlanPatch = Partial<
  Pick<
    ConversationTurnPlan,
    | "mode"
    | "focusTerms"
    | "mainFocus"
    | "eventType"
    | "relationHint"
    | "topicType"
    | "listeningStrategy"
    | "shouldAskQuestion"
    | "suggestedQuestion"
  >
>;

type AiPlanAnalysis = {
  planPatch: AiPlanPatch | null;
  memoryRetrieval: MemoryRetrievalRequest | null;
  memoryManagementRequest: DetectedMemoryManagementRequest | null;
  memoryCandidates: ExtractedMemoryCandidate[];
  rejectedCount: number;
  rejectionReasonCodes: MemoryExtractionResult["rejectionReasonCodes"];
};

const aiPlanResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: [...conversationModes] },
    focusTerms: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
    mainFocus: { anyOf: [{ type: "string" }, { type: "null" }] },
    eventType: { type: "string", enum: [...eventTypes] },
    relationHint: { anyOf: [{ type: "string" }, { type: "null" }] },
    topicType: { type: "string", enum: [...topicTypes] },
    listeningStrategy: {
      type: "string",
      enum: [
        "acknowledge",
        "reflect_content",
        "reflect_emotion",
        "show_interest",
        "ask_open_question",
        "ask_clarification",
        "allow_silence",
        "change_topic",
      ],
    },
    shouldAskQuestion: { type: "boolean" },
    suggestedQuestion: { anyOf: [{ type: "string" }, { type: "null" }] },
    memoryCandidates: {
      type: "array",
      items: MEMORY_CANDIDATE_JSON_SCHEMA,
      maxItems: MAX_MEMORY_CANDIDATES_PER_TURN,
    },
    memoryRetrieval: {
      type: "object",
      description: "Whether confirmed user-approved long-term memory is needed to answer the current userMessage naturally. Decide from the current utterance; recentMessages may only disambiguate continuity.",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["none", "topic_match", "category_browse", "clarification"],
          description: "topic_match needs a concrete subject; category_browse is only for an explicit request to review a known category without a concrete subject; clarification is an explicit prior-memory reference with neither category nor subject; none means no memory work.",
        },
        categories: {
          type: "array",
          description: "Required for topic_match and category_browse; empty for none and clarification.",
          items: {
            type: "string",
            enum: ["person", "place", "experience", "preference", "routine", "wish"],
          },
          maxItems: MEMORY_RETRIEVAL_CONFIG.maxCategories,
        },
        searchTerms: {
          type: "array",
          description: "Concrete subject phrases required only for topic_match; empty for all other modes.",
          items: { type: "string", maxLength: MEMORY_RETRIEVAL_CONFIG.maxSearchTermLength },
          maxItems: MEMORY_RETRIEVAL_CONFIG.maxSearchTerms,
        },
        polarities: {
          type: "array",
          description: "Explicitly requested preference polarity. Empty when unspecified.",
          items: { type: "string", enum: ["positive", "negative", "neutral"] },
          maxItems: 3,
        },
        temporalScopes: {
          type: "array",
          description: "Explicit time scope of the sought fact. Empty when unspecified.",
          items: { type: "string", enum: ["past", "current", "future", "timeless", "unknown"] },
          maxItems: 5,
        },
        purpose: {
          type: "string",
          description: "Concise purpose. Non-empty for topic_match, category_browse, and clarification; empty for none.",
          maxLength: MEMORY_RETRIEVAL_CONFIG.maxPurposeLength,
        },
        noSearchReason: {
          type: "string",
          description: "Use a reason only for mode=none; otherwise use none.",
          enum: ["none", "general_knowledge", "greeting", "current_turn_sufficient", "memory_would_be_unnatural", "no_concrete_topic"],
        },
        clarificationReason: {
          type: "string",
          description: "Use a clarification reason only for mode=clarification; otherwise use none.",
          enum: ["none", "category_and_topic_unknown", "ambiguous_prior_reference"],
        },
      },
      required: ["mode", "categories", "searchTerms", "polarities", "temporalScopes", "purpose", "noSearchReason", "clarificationReason"],
    },
    memoryManagementRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: { type: "string", enum: ["NONE", "CORRECT", "FORGET"] },
        category: {
          anyOf: [
            {
              type: "string",
              enum: ["person", "place", "experience", "preference", "routine", "wish"],
            },
            { type: "null" },
          ],
        },
        searchTerms: {
          type: "array",
          items: { type: "string", maxLength: MEMORY_RETRIEVAL_CONFIG.maxSearchTermLength },
          maxItems: MEMORY_RETRIEVAL_CONFIG.maxSearchTerms,
        },
        correctedContent: {
          anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }],
        },
      },
      required: ["intent", "category", "searchTerms", "correctedContent"],
    },
  },
  required: [
    "mode",
    "focusTerms",
    "mainFocus",
    "eventType",
    "relationHint",
    "topicType",
    "listeningStrategy",
    "shouldAskQuestion",
    "suggestedQuestion",
    "memoryCandidates",
    "memoryRetrieval",
    "memoryManagementRequest",
  ],
} as const;

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

function normalizeAiPlanPatch(parsed: Record<string, unknown>): AiPlanPatch | null {
  const focusTerms = sanitizeTerms(parsed.focusTerms);
  const mainFocus = sanitizeText(parsed.mainFocus, 32);
  const suggestedQuestionText = sanitizeText(parsed.suggestedQuestion, 80);
  const suggestedQuestion =
    suggestedQuestionText && countQuestions(suggestedQuestionText) === 1
      ? suggestedQuestionText
      : null;
  const relationHint = sanitizeText(parsed.relationHint, 40);
  const patch: AiPlanPatch = {};
  const mode = pickEnum(parsed.mode, conversationModes);
  const eventType = pickEnum(parsed.eventType, eventTypes);
  const topicType = pickEnum(parsed.topicType, topicTypes);
  const listeningStrategy = isListeningStrategy(parsed.listeningStrategy)
    ? parsed.listeningStrategy
    : null;

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

  if (listeningStrategy) {
    patch.listeningStrategy = listeningStrategy;
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
  userMessage: string,
  recentAssistantReplies: string[],
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
  const mergedPlan: ConversationTurnPlan = {
    ...localPlan,
    mode: patch.mode ?? localPlan.mode,
    focusTerms: focusTerms.slice(0, 6),
    mainFocus,
    eventType: patch.eventType ?? localPlan.eventType,
    relationHint: patch.relationHint ?? localPlan.relationHint,
    topicType: patch.topicType ?? localPlan.topicType,
    listeningStrategy: patch.listeningStrategy ?? localPlan.listeningStrategy,
    shouldAskQuestion: patch.shouldAskQuestion ?? localPlan.shouldAskQuestion,
    suggestedQuestion: (patch.shouldAskQuestion ?? localPlan.shouldAskQuestion)
      ? (patch.suggestedQuestion ?? localPlan.suggestedQuestion ?? null)
      : null,
  };

  return normalizeConversationTurnPlan({
    plan: mergedPlan,
    userMessage,
    recentAssistantReplies,
    hasConcreteTopic:
      localPlan.mainFocus !== null && localPlan.topicType !== "feeling",
  });
}

async function createOpenAIPlanAnalysis({
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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();

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
          "Return one object matching the supplied JSON schema.",
          "Pick the most conversation-worthy concrete term, not just a feeling word.",
          "Prefer a natural follow-up question when it would help the conversation continue.",
          "Never make medical diagnosis. Safety remains handled elsewhere.",
          'Allowed mode: casual, reminiscence, loneliness, anxiety, daily_life, continuation.',
          'Allowed eventType: talked_with, met, went_to, ate, saw, made, heard_about, is_trending, remembered, felt, unknown.',
          'Allowed topicType: person, place, food, activity, object, memory, feeling, unknown.',
          'Allowed listeningStrategy: acknowledge, reflect_content, reflect_emotion, show_interest, ask_open_question, ask_clarification, allow_silence, change_topic.',
          "suggestedQuestion must be a short natural Japanese question, not a generic interview question.",
          "memoryCandidates must contain at most five durable facts useful in future conversations.",
          "Extract memoryCandidates only from userMessage in this request. Never re-extract recentMessages.",
          "Do not infer personality, emotion, diagnosis, cognition, or facts not stated by the user.",
          "Do not extract temporary emotion, meaningless short replies, news, television content, quoted claims, or third-party private information.",
          "Do not extract passwords, financial identifiers, government identifiers, phone numbers, email addresses, or detailed addresses.",
          "Use subject=user only when the fact is about the user. Use other or unknown otherwise.",
          "Use assertion=quoted for someone else's quoted statement and hypothetical only for a clearly stated user wish.",
          "Negative preferences must use category=preference and polarity=negative.",
          "normalizedKey must be a short phrase grounded in wording from userMessage.",
          "If nothing qualifies, return an empty memoryCandidates array.",
          "For memoryRetrieval, classify the current userMessage into exactly one mode. Do not assume whether the database contains a match; server-side retrieval handles that.",
          "Use topic_match when the user refers to a concrete remembered subject: categories and short concrete searchTerms are required.",
          "Use category_browse only when the user explicitly asks to review remembered information in a known category, such as their preferences or future wishes, but gives no concrete subject. categories are required and searchTerms must be empty.",
          "Use clarification when the user explicitly refers to prior memory but neither a category nor a concrete subject can be identified. All search conditions must be empty and clarificationReason must explain the ambiguity.",
          "Use none for greetings, general knowledge, ordinary statements about current preferences or experiences, a turn fully answered by current content, or when memory would be unnatural. All search conditions and purpose must be empty, and noSearchReason must not be none.",
          "For topic_match, category_browse, and clarification: purpose must be non-empty and noSearchReason must be none. clarificationReason is non-none only for clarification.",
          "Use polarities and temporalScopes only when the user explicitly asks for them; otherwise use empty arrays.",
          "temporalScopes describes when the remembered fact itself was or will be true. Do not use past merely because the user says it was discussed previously or asks whether it is remembered.",
          "Use userMessage as the source for retrieval intent and search terms. recentMessages may disambiguate what a continuing reference means, but must not independently trigger retrieval.",
          "Example topic_match: 『青い帽子について前に話した？』 => mode=topic_match, categories=[preference], searchTerms=[青い帽子].",
          "Example category_browse: 『私の好みを覚えている？』 => mode=category_browse, categories=[preference], searchTerms=[].",
          "Example clarification: 『前に話したことを覚えている？』 => mode=clarification with empty conditions.",
          "Example none: 『富士山の高さは？』 => mode=none, noSearchReason=general_knowledge. An ordinary statement such as 『今日はコーヒーが好き』 is not a request to browse all preferences.",
          "Detect an explicit request to correct or forget a previously remembered fact in memoryManagementRequest.",
          "Use CORRECT only when the user explicitly says a prior remembered fact is wrong or asks to correct it. Use FORGET only for an explicit request not to remember or to forget it. Otherwise use NONE.",
          "For NONE, category and correctedContent must be null and searchTerms must be empty.",
          "For CORRECT or FORGET, provide one category and concrete search terms for the existing memory. correctedContent is only the explicit corrected fact, otherwise null.",
          "For memoryManagementRequest, category describes the remembered fact, not the sentence's grammatical subject: person=relationships or facts about a named person, preference=likes/dislikes, routine=repeated habits, place=locations, experience=past events, wish=future hopes.",
          "For memoryManagementRequest searchTerms, copy the shortest distinctive noun phrases that identify the old fact (for example 深煎りコーヒー or 朝の散歩). Exclude 私, 記憶, 忘れて, 訂正, 間違い, and other request wording.",
          "A detected management request must never be executed automatically. When intent is CORRECT or FORGET, return an empty memoryCandidates array.",
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
    text: {
      format: {
        type: "json_schema",
        name: "conversation_plan_with_memory_candidates",
        strict: true,
        schema: aiPlanResponseSchema,
      },
    },
    store: false,
  });

  const parsed = parseJsonObject(response.output_text);

  if (!parsed) {
    return {
      planPatch: null,
      memoryRetrieval: null,
      memoryManagementRequest: null,
      memoryCandidates: [],
      rejectedCount: 1,
      rejectionReasonCodes: ["openai_extraction_failed"],
    } satisfies AiPlanAnalysis;
  }

  const memoryValidation = validateMemoryCandidates({
    rawCandidates: parsed.memoryCandidates,
    currentUtterance: userMessage,
  });

  return {
    planPatch: normalizeAiPlanPatch(parsed),
    memoryRetrieval: normalizeMemoryRetrievalRequest(parsed.memoryRetrieval),
    memoryManagementRequest: normalizeDetectedMemoryManagementRequest(
      parsed.memoryManagementRequest,
    ),
    memoryCandidates: memoryValidation.candidates,
    rejectedCount: memoryValidation.rejectedCount,
    rejectionReasonCodes: memoryValidation.rejectionReasonCodes,
  } satisfies AiPlanAnalysis;
}

async function createOpenAIReply({
  messages,
  userMessage,
  turnPlan,
  topicStarter,
  topicTitle,
  memories,
  memoryMode,
  memorySelectionRequired,
  memoryClarificationReason,
}: {
  messages: StoredChatMessage[];
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  topicStarter: boolean;
  topicTitle: string | null;
  memories: MemorySearchResult[];
  memoryMode: MemoryRetrievalMode;
  memorySelectionRequired: boolean;
  memoryClarificationReason: MemoryRetrievalRequest["clarificationReason"];
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();

  if (!apiKey || !model) {
    return null;
  }

  const client = new OpenAI({ apiKey });
  const responseTurnPlan = memoryMode === "clarification" || memorySelectionRequired
    ? {
        ...turnPlan,
        listeningStrategy: "ask_clarification" as const,
        shouldAskQuestion: true,
        suggestedQuestion: null,
      }
    : turnPlan;
  const input = buildAiInput({
    messages,
    userMessage,
    turnPlan: responseTurnPlan,
    topicStarter,
    topicTitle,
    memories: memories.map(toMemoryPromptContext),
    memoryMode,
    memorySelectionRequired,
    memoryClarificationReason,
  });

  const response = await client.responses.create({
    model,
    input,
    store: false,
  });

  return response.output_text.trim() || null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);
  const profileId = user.profileId;

  let body: {
    message?: unknown;
    conversationId?: unknown;
    moodScore?: unknown;
    speechEnabled?: unknown;
    topicStarter?: unknown;
    topicTitle?: unknown;
    rawContent?: unknown;
    inputType?: unknown;
    clientMessageId?: unknown;
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
  const rawContent =
    typeof body.rawContent === "string" ? body.rawContent : message;
  const inputType =
    body.inputType === undefined
      ? "text"
      : isMessageInputType(body.inputType)
        ? body.inputType
        : null;
  const clientMessageId =
    typeof body.clientMessageId === "string" && body.clientMessageId.length <= 120
      ? body.clientMessageId
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

  if (!inputType) {
    return jsonResponse({ error: "入力種別が不正です。" }, 400);
  }

  if (rawContent.length > 4000) {
    return jsonResponse({ error: "入力原文が長すぎます。" }, 400);
  }

  const riskLevel: RiskLevel = detectRisk(message);
  const emotionLabel = estimateEmotion(message);
  const savedUserMessage = await recordUserMessage({
    profileId,
    conversationId,
    message,
    rawContent,
    inputType,
    clientMessageId,
    moodScore,
    emotionLabel,
    riskLevel,
  });
  const recentAssistantReplies = getRecentAssistantReplies(
    savedUserMessage.recentMessages,
  );
  let finalTurnPlan: ConversationTurnPlan | null = null;
  let planSource: PlanSource;
  let generationSource: GenerationSource;
  let reply: string;
  let extractedMemoryCandidates: ExtractedMemoryCandidate[] = [];
  let detectedMemoryManagementRequest: DetectedMemoryManagementRequest | null = null;
  let memoryManagementMatches: MemorySearchResult[] = [];
  let memoryRetrievalRequest: MemoryRetrievalRequest | null = null;
  let memoryRetrievalSource: MemoryRetrievalSource = "none";
  let plannedMemoryRetrievalMode: MemoryRetrievalMode = "none";
  let memorySearchResults: MemorySearchResult[] = [];
  let memorySearchEvaluation: MemorySearchEvaluation | null = null;
  let memoryRetrievalStatus: MemoryRetrievalStatus =
    riskLevel === "urgent"
      ? "skipped_safety"
      : "skipped_no_openai";
  let memoryRetrievalFailureReason: MemoryRetrievalFailureReason | null = null;
  let replyRejectionReason: ReplyRejectionReason | null = null;
  let memoryExtraction = createMemoryExtractionResult(
    riskLevel === "urgent" ? "skipped_safety" : "skipped_no_openai",
  );
  const hasOpenAIConfiguration = Boolean(
    process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim(),
  );

  if (riskLevel === "urgent") {
    planSource = "safety";
    generationSource = "safety";
    reply = getUrgentSafetyReply();
  } else {
    const turnPlan = analyzeConversationTurn({
      userMessage: message,
      recentMessages: savedUserMessage.recentMessages,
      recentAssistantReplies,
      safetyResult: riskLevel,
    });
    finalTurnPlan = turnPlan;
    planSource = "local";

    if (hasOpenAIConfiguration) {
      try {
        const aiAnalysis = await createOpenAIPlanAnalysis({
          messages: savedUserMessage.recentMessages,
          userMessage: message,
          localPlan: turnPlan,
          topicStarter,
          topicTitle,
        });

        if (aiAnalysis) {
          memoryRetrievalRequest = aiAnalysis.memoryRetrieval;
          plannedMemoryRetrievalMode = aiAnalysis.memoryRetrieval?.mode ?? "none";
          if (aiAnalysis.memoryRetrieval?.mode === "topic_match" || aiAnalysis.memoryRetrieval?.mode === "category_browse") {
            memoryRetrievalSource = "openai_plan";
          }
          detectedMemoryManagementRequest = aiAnalysis.memoryManagementRequest;
          extractedMemoryCandidates =
            detectedMemoryManagementRequest?.intent === "CORRECT" ||
            detectedMemoryManagementRequest?.intent === "FORGET"
              ? []
              : aiAnalysis.memoryCandidates;
          memoryExtraction = createMemoryExtractionResult(
            extractedMemoryCandidates.length > 0
              ? "no_candidates"
              : aiAnalysis.rejectedCount > 0
                ? "filtered"
                : "no_candidates",
            {
              rejectedCount: aiAnalysis.rejectedCount,
              rejectionReasonCodes: aiAnalysis.rejectionReasonCodes,
            },
          );

          if (aiAnalysis.planPatch) {
            finalTurnPlan = mergeAiPlanPatch(
              turnPlan,
              aiAnalysis.planPatch,
              message,
              recentAssistantReplies,
            );
            planSource = "openai";
          }
        }
      } catch {
        finalTurnPlan = turnPlan;
        planSource = "local";
        memoryExtraction = createMemoryExtractionResult("failed", {
          rejectedCount: 1,
          rejectionReasonCodes: ["openai_extraction_failed"],
        });
        memoryRetrievalStatus = "failed";
        memoryRetrievalFailureReason = "plan_unavailable";
      }
    }

    const hasMemoryManagementRequest =
      detectedMemoryManagementRequest?.intent === "CORRECT" ||
      detectedMemoryManagementRequest?.intent === "FORGET";
    if (hasMemoryManagementRequest) {
      memoryRetrievalRequest = {
        mode: "none",
        categories: [],
        searchTerms: [],
        polarities: [],
        temporalScopes: [],
        purpose: "",
        noSearchReason: "current_turn_sufficient",
        clarificationReason: "none",
      };
      memoryRetrievalSource = "none";
    } else if (
      hasOpenAIConfiguration &&
      (memoryRetrievalRequest?.mode === "none" || memoryRetrievalRequest?.mode === "clarification")
    ) {
      const fallbackRequest = createContinuityFallbackRequest(message);
      if (
        fallbackRequest &&
        (memoryRetrievalRequest.mode === "none" || fallbackRequest.mode !== "clarification")
      ) {
        memoryRetrievalRequest = fallbackRequest;
        memoryRetrievalSource = "local_fallback";
      }
    }

    if (memoryRetrievalRequest?.mode === "topic_match" || memoryRetrievalRequest?.mode === "category_browse") {
      try {
        const retrieval = await retrieveConfirmedMemories({
          profileId,
          storageBackend: savedUserMessage.storageBackend,
          request: memoryRetrievalRequest,
        });
        memorySearchEvaluation = retrieval;
        memorySearchResults = retrieval.results;
        memoryRetrievalStatus = retrieval.results.length === 0
          ? "no_match"
          : retrieval.selectionRequired
            ? "candidate_selection_required"
            : "retrieved";
      } catch {
        console.warn("Confirmed memory retrieval failed; continuing without memory.");
        memorySearchResults = [];
        memoryRetrievalStatus = "failed";
        memoryRetrievalFailureReason = "memory_read_failed";
      }
    } else if (hasOpenAIConfiguration && memoryRetrievalStatus !== "failed") {
      memoryRetrievalStatus = memoryRetrievalRequest
        ? memoryRetrievalRequest.mode === "clarification" ? "clarification" : "not_requested"
        : "failed";
      memoryRetrievalFailureReason = memoryRetrievalRequest
        ? null
        : "invalid_request";
    }

    if (
      detectedMemoryManagementRequest &&
      detectedMemoryManagementRequest.intent !== "NONE" &&
      detectedMemoryManagementRequest.category
    ) {
      try {
        const managementRetrieval = await retrieveConfirmedMemories({
          profileId,
          storageBackend: savedUserMessage.storageBackend,
          request: {
            mode: "topic_match",
            categories: [detectedMemoryManagementRequest.category],
            searchTerms: detectedMemoryManagementRequest.searchTerms,
            polarities: [],
            temporalScopes: [],
            purpose:
              detectedMemoryManagementRequest.intent === "CORRECT"
                ? "conversation_correction"
                : "conversation_forget",
            noSearchReason: "none",
            clarificationReason: "none",
          },
        });
        memoryManagementMatches = managementRetrieval.results;
      } catch {
        console.warn("Memory management target lookup failed; saving without matches.");
        memoryManagementMatches = [];
      }
    }

    if (
      finalTurnPlan &&
      (memoryRetrievalRequest?.mode === "clarification" || memorySearchEvaluation?.selectionRequired)
    ) {
      finalTurnPlan = {
        ...finalTurnPlan,
        listeningStrategy: "ask_clarification",
        shouldAskQuestion: true,
        suggestedQuestion: null,
      };
    }

    let generatedReply: string | null = null;

    if (hasOpenAIConfiguration) {
      try {
        const candidateReply = await createOpenAIReply({
          messages: savedUserMessage.recentMessages,
          userMessage: message,
          turnPlan: finalTurnPlan,
          topicStarter,
          topicTitle,
          memories: memorySearchResults,
          memoryMode: memoryRetrievalRequest?.mode ?? "none",
          memorySelectionRequired: memorySearchEvaluation?.selectionRequired ?? false,
          memoryClarificationReason: memoryRetrievalRequest?.clarificationReason ?? "none",
        });
        const validation = validateReplyAgainstContract({
          text: candidateReply ?? "",
          memoryMode: memoryRetrievalRequest?.mode ?? "none",
          memorySelectionRequired: memorySearchEvaluation?.selectionRequired ?? false,
          listeningStrategy: finalTurnPlan?.listeningStrategy ?? null,
          memories: memorySearchResults.map(toMemoryPromptContext),
          currentUserMessage: message,
        });
        generatedReply = validation.accepted ? candidateReply : null;
        replyRejectionReason = validation.reason;
      } catch {
        replyRejectionReason = "generation_error";
        console.warn("OpenAI response failed; using mock reply.");
      }
    }

    if (generatedReply) {
      reply = generatedReply;
      generationSource = "openai";
    } else {
      memorySearchEvaluation = discardSelectedMemoryResults(memorySearchEvaluation);
      memorySearchResults = [];
      reply = createMockReply({
        userMessage: message,
        turnPlan: finalTurnPlan,
        recentMessages: savedUserMessage.recentMessages,
        topicStarter,
        topicTitle,
        memoryMode: memoryRetrievalRequest?.mode ?? "none",
        memories: memorySearchResults.map(toMemoryPromptContext),
        memorySelectionRequired: memorySearchEvaluation?.selectionRequired ?? false,
      });
      generationSource = "mock";
    }
  }

  const sourceUtteranceIds = dedupeSourceUtteranceIds(
    riskLevel === "urgent"
      ? [savedUserMessage.userMessage.id]
      : savedUserMessage.recentMessages
          .filter((storedMessage) => storedMessage.role === "user")
          .map((storedMessage) => storedMessage.id),
  );
  const createDecisionInput = () => ({
      conversationId: savedUserMessage.conversationId,
      listeningStrategy: finalTurnPlan?.listeningStrategy ?? null,
      planSource,
      generationSource,
      mode: finalTurnPlan?.mode ?? "safety",
      mainFocus: finalTurnPlan?.mainFocus ?? null,
      shouldAskQuestion: finalTurnPlan?.shouldAskQuestion ?? false,
      sourceUtteranceIds,
      memoryUsages: memorySearchResults.map((result) => ({
        memoryId: result.memory.id,
        retrievalScore: result.score,
        usageReason: result.reason,
        usageRole: memoryRetrievalRequest?.mode === "category_browse"
          ? "candidate_presentation" as const
          : "answer_context" as const,
      })),
      memoryRetrievalAudit: createMemoryRetrievalAuditInput({
        profileId,
        request: memoryRetrievalRequest,
        requestSource: memoryRetrievalSource,
        plannedMode: plannedMemoryRetrievalMode,
        evaluation: memorySearchEvaluation,
        status: memoryRetrievalStatus,
        failureReason: memoryRetrievalFailureReason,
        generationRejectionReason: replyRejectionReason,
      }),
      ...(detectedMemoryManagementRequest &&
      detectedMemoryManagementRequest.intent !== "NONE" &&
      detectedMemoryManagementRequest.category
        ? {
            memoryManagementRequest: {
              profileId,
              sourceMessageId: savedUserMessage.userMessage.id,
              intent: detectedMemoryManagementRequest.intent,
              category: detectedMemoryManagementRequest.category,
              searchTerms: detectedMemoryManagementRequest.searchTerms,
              correctedContent: detectedMemoryManagementRequest.correctedContent,
              matches: memoryManagementMatches.map((result) => ({
                memoryId: result.memory.id,
                score: result.score,
              })),
            },
          }
        : {}),
    });
  let savedAssistantTurn;
  try {
    savedAssistantTurn = await recordAssistantTurn({
      profileId,
      conversationId: savedUserMessage.conversationId,
      reply,
      emotionLabel,
      riskLevel,
      storageBackend: savedUserMessage.storageBackend,
      decision: createDecisionInput(),
    });
  } catch (error) {
    if (memorySearchResults.length === 0 || !finalTurnPlan) throw error;
    console.warn("Memory usage audit save failed; discarding memory-assisted reply.");
    memorySearchResults = [];
    memorySearchEvaluation = discardSelectedMemoryResults(memorySearchEvaluation);
    memoryRetrievalStatus = "failed";
    memoryRetrievalFailureReason = "usage_write_failed";
    reply = createMockReply({
      userMessage: message,
      turnPlan: finalTurnPlan,
      recentMessages: savedUserMessage.recentMessages,
      topicStarter,
      topicTitle,
      memoryMode: "none",
    });
    generationSource = "mock";
    savedAssistantTurn = await recordAssistantTurn({
      profileId,
      conversationId: savedUserMessage.conversationId,
      reply,
      emotionLabel,
      riskLevel,
      storageBackend: savedUserMessage.storageBackend,
      decision: createDecisionInput(),
    });
  }
  if (extractedMemoryCandidates.length > 0) {
    const memoryWrite = await recordMemoryCandidates({
      profileId,
      conversationId: savedUserMessage.conversationId,
      decisionId: savedAssistantTurn.decision.id,
      sourceMessageId: savedUserMessage.userMessage.id,
      storageBackend: savedUserMessage.storageBackend,
      candidates: extractedMemoryCandidates,
    });

    if (memoryWrite.failureReason) {
      memoryExtraction = createMemoryExtractionResult("failed", {
        rejectedCount: memoryExtraction.rejectedCount + 1,
        rejectionReasonCodes: [
          ...memoryExtraction.rejectionReasonCodes,
          memoryWrite.failureReason,
        ].filter((reason, index, reasons) => reasons.indexOf(reason) === index),
      });
    } else {
      memoryExtraction = createMemoryExtractionResult("saved", {
        candidateCount: memoryWrite.candidates.length,
        candidateIds: memoryWrite.candidates.map((candidate) => candidate.id),
        categories: [
          ...new Set(memoryWrite.candidates.map((candidate) => candidate.category)),
        ],
        rejectedCount: memoryExtraction.rejectedCount,
        rejectionReasonCodes: memoryExtraction.rejectionReasonCodes,
      });
    }
  }
  const usedMock = generationSource === "mock";

  return jsonResponse({
    reply,
    conversationId: savedUserMessage.conversationId,
    userMessageId: savedUserMessage.userMessage.id,
    assistantMessageId: savedAssistantTurn.assistantMessage.id,
    decisionId: savedAssistantTurn.decision.id,
    listeningStrategy: finalTurnPlan?.listeningStrategy ?? null,
    sourceUtteranceIds,
    planSource,
    generationSource,
    emotionLabel,
    riskLevel,
    usedMock,
    memoryExtraction,
    debug: {
      usedMock,
      planSource,
      generationSource,
      listeningStrategy: finalTurnPlan?.listeningStrategy ?? null,
      mode: finalTurnPlan?.mode ?? "safety",
      mainFocus: finalTurnPlan?.mainFocus ?? null,
      focusTerms: finalTurnPlan?.focusTerms ?? [],
      eventType: finalTurnPlan?.eventType ?? "unknown",
      topicType: finalTurnPlan?.topicType ?? "unknown",
      shouldAskQuestion: finalTurnPlan?.shouldAskQuestion ?? false,
      suggestedQuestion: finalTurnPlan?.suggestedQuestion ?? null,
      topicStarter,
      memoryExtraction: {
        status: memoryExtraction.status,
        candidateCount: memoryExtraction.candidateCount,
        categories: memoryExtraction.categories,
        rejectedCount: memoryExtraction.rejectedCount,
        rejectionReasonCodes: memoryExtraction.rejectionReasonCodes,
      },
      memoryRetrieval: {
        executed:
          memorySearchEvaluation !== null ||
          memoryRetrievalFailureReason === "memory_read_failed",
        candidateCount: memorySearchEvaluation?.activeMemoryCount ?? 0,
        usedCount: memorySearchResults.length,
        categories: [
          ...new Set(memorySearchResults.map((result) => result.memory.category)),
        ],
        source: memoryRetrievalSource,
        status: memoryRetrievalStatus,
        failureReason: memoryRetrievalFailureReason,
      },
    },
  });
}
