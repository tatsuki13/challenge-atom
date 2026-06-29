import {
  addUtcDays,
  dateKeyToUtcDate,
  getTokyoDateKey,
} from "./date";
import {
  buildConversationMemoryContext,
  type ConversationMemoryContext,
} from "./ai/adaptiveGuidance";
import {
  getDemoConversationMemoryContext,
  getDemoMetrics,
  recordDemoAssistantMessage,
  recordDemoUserMessage,
} from "./demoStore";
import { getPrismaClient } from "./prisma";
import {
  DEMO_PROFILE_ID,
  RECENT_MESSAGE_LIMIT,
  type EmotionLabel,
  type MetricsSummary,
  type RiskLevel,
  type StorageMode,
  type StoredChatMessage,
} from "./conversationTypes";

type PrismaClientInstance = NonNullable<ReturnType<typeof getPrismaClient>>;

function toStoredMessage(message: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  emotionLabel: string | null;
  riskLevel: string;
  createdAt: Date;
}): StoredChatMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    emotionLabel: (message.emotionLabel as EmotionLabel | null) ?? null,
    riskLevel: (message.riskLevel as RiskLevel) ?? "none",
    createdAt: message.createdAt,
  };
}

function getAiMode() {
  return process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
    ? "openai"
    : "mock";
}

async function ensureDemoProfile(prisma: PrismaClientInstance) {
  await prisma.profile.upsert({
    where: { id: DEMO_PROFILE_ID },
    create: {
      id: DEMO_PROFILE_ID,
      displayName: "デモ利用者",
      consentFamilyShare: false,
    },
    update: {},
  });
}

async function incrementDailyMetric({
  prisma,
  newConversation,
  userMessageCount,
  assistantMessageCount,
  userCharCount,
}: {
  prisma: PrismaClientInstance;
  newConversation: boolean;
  userMessageCount: number;
  assistantMessageCount: number;
  userCharCount: number;
}) {
  const dateKey = getTokyoDateKey();
  const date = dateKeyToUtcDate(dateKey);
  const estimatedMinutes = userMessageCount > 0 ? 1 : 0;

  await prisma.dailyMetric.upsert({
    where: {
      profileId_date: {
        profileId: DEMO_PROFILE_ID,
        date,
      },
    },
    create: {
      profileId: DEMO_PROFILE_ID,
      date,
      conversationCount: newConversation ? 1 : 0,
      userMessageCount,
      assistantMessageCount,
      userCharCount,
      estimatedMinutes,
    },
    update: {
      conversationCount: { increment: newConversation ? 1 : 0 },
      userMessageCount: { increment: userMessageCount },
      assistantMessageCount: { increment: assistantMessageCount },
      userCharCount: { increment: userCharCount },
      estimatedMinutes: { increment: estimatedMinutes },
    },
  });
}

export async function recordUserMessage({
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
}): Promise<{
  conversationId: string;
  recentMessages: StoredChatMessage[];
  storageMode: StorageMode;
}> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return recordDemoUserMessage({
      conversationId,
      message,
      moodScore,
      emotionLabel,
      riskLevel,
    });
  }

  try {
    await ensureDemoProfile(prisma);

    const existingConversation = conversationId
      ? await prisma.conversation.findUnique({
          where: { id: conversationId },
        })
      : null;
    const conversation =
      existingConversation ??
      (await prisma.conversation.create({
        data: {
          profileId: DEMO_PROFILE_ID,
          title: message.slice(0, 24) || "今日の会話",
          moodScoreStart: moodScore,
          moodScoreEnd: moodScore,
        },
      }));

    if (existingConversation && moodScore !== null) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { moodScoreEnd: moodScore },
      });
    }

    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
        emotionLabel,
        riskLevel,
      },
    });

    if (riskLevel !== "none") {
      await prisma.riskEvent.create({
        data: {
          profileId: DEMO_PROFILE_ID,
          conversationId: conversation.id,
          messageId: userMessage.id,
          riskLevel,
          note: `${riskLevel} keyword detected`,
        },
      });
    }

    await incrementDailyMetric({
      prisma,
      newConversation: !existingConversation,
      userMessageCount: 1,
      assistantMessageCount: 0,
      userCharCount: message.length,
    });

    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_MESSAGE_LIMIT,
    });

    return {
      conversationId: conversation.id,
      recentMessages: recentMessages.reverse().map(toStoredMessage),
      storageMode: "database",
    };
  } catch {
    console.warn("Database save failed; using memory store.");
    return recordDemoUserMessage({
      conversationId,
      message,
      moodScore,
      emotionLabel,
      riskLevel,
    });
  }
}

export async function recordAssistantMessage({
  conversationId,
  reply,
  emotionLabel,
  riskLevel,
  storageMode,
}: {
  conversationId: string;
  reply: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  storageMode: StorageMode;
}) {
  if (storageMode === "memory") {
    recordDemoAssistantMessage({
      conversationId,
      reply,
      emotionLabel,
      riskLevel,
    });
    return;
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    recordDemoAssistantMessage({
      conversationId,
      reply,
      emotionLabel,
      riskLevel,
    });
    return;
  }

  try {
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: reply,
        emotionLabel,
        riskLevel,
      },
    });
    await incrementDailyMetric({
      prisma,
      newConversation: false,
      userMessageCount: 0,
      assistantMessageCount: 1,
      userCharCount: 0,
    });
  } catch {
    console.warn("Assistant message save failed; using memory store.");
    recordDemoAssistantMessage({
      conversationId,
      reply,
      emotionLabel,
      riskLevel,
    });
  }
}

export async function getConversationMemoryContext({
  storageMode,
}: {
  storageMode: StorageMode;
}): Promise<ConversationMemoryContext | null> {
  if (storageMode === "memory") {
    return getDemoConversationMemoryContext();
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return getDemoConversationMemoryContext();
  }

  try {
    await ensureDemoProfile(prisma);

    const conversations = await prisma.conversation.findMany({
      where: { profileId: DEMO_PROFILE_ID },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        moodScoreStart: true,
        moodScoreEnd: true,
        startedAt: true,
      },
    });
    const conversationIds = conversations.map((conversation) => conversation.id);

    if (conversationIds.length === 0) {
      return null;
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });

    return buildConversationMemoryContext({
      messages: messages
        .map(toStoredMessage)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      moodSnapshots: conversations.map((conversation) => ({
        moodScoreStart: conversation.moodScoreStart,
        moodScoreEnd: conversation.moodScoreEnd,
        startedAt: conversation.startedAt,
      })),
    });
  } catch {
    console.warn("Conversation memory lookup failed.");
    return null;
  }
}

export async function getTodayMetrics(): Promise<MetricsSummary> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return getDemoMetrics();
  }

  try {
    await ensureDemoProfile(prisma);

    const dateKey = getTokyoDateKey();
    const date = dateKeyToUtcDate(dateKey);
    const nextDate = addUtcDays(date, 1);
    const metric = await prisma.dailyMetric.findUnique({
      where: {
        profileId_date: {
          profileId: DEMO_PROFILE_ID,
          date,
        },
      },
    });
    const latestConversation = await prisma.conversation.findFirst({
      where: { profileId: DEMO_PROFILE_ID },
      orderBy: { startedAt: "desc" },
      select: {
        moodScoreEnd: true,
        moodScoreStart: true,
      },
    });
    const riskGroups = await prisma.riskEvent.groupBy({
      by: ["riskLevel"],
      where: {
        profileId: DEMO_PROFILE_ID,
        createdAt: {
          gte: date,
          lt: nextDate,
        },
      },
      _count: {
        _all: true,
      },
    });

    return {
      date: dateKey,
      conversationCount: metric?.conversationCount ?? 0,
      userMessageCount: metric?.userMessageCount ?? 0,
      assistantMessageCount: metric?.assistantMessageCount ?? 0,
      userCharCount: metric?.userCharCount ?? 0,
      estimatedMinutes: metric?.estimatedMinutes ?? 0,
      latestMoodScore:
        latestConversation?.moodScoreEnd ??
        latestConversation?.moodScoreStart ??
        null,
      riskWatchCount:
        riskGroups.find((group) => group.riskLevel === "watch")?._count._all ??
        0,
      riskUrgentCount:
        riskGroups.find((group) => group.riskLevel === "urgent")?._count._all ??
        0,
      storageMode: "database",
      aiMode: getAiMode(),
    };
  } catch {
    console.warn("Database metrics failed; using memory metrics.");
    return getDemoMetrics();
  }
}
