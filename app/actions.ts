"use server";

import { getTodayMetrics } from "@/lib/conversationStore";
import { getPrismaClient } from "@/lib/prisma";

export async function getData() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      connected: false,
      profileCount: 0,
      conversationCount: 0,
      messageCount: 0,
      metrics: await getTodayMetrics(),
    };
  }

  try {
    const [profileCount, conversationCount, messageCount, metrics] =
      await Promise.all([
        prisma.profile.count(),
        prisma.conversation.count(),
        prisma.message.count(),
        getTodayMetrics(),
      ]);

    return {
      connected: metrics.storageMode === "database",
      profileCount,
      conversationCount,
      messageCount,
      metrics,
    };
  } catch {
    return {
      connected: false,
      profileCount: 0,
      conversationCount: 0,
      messageCount: 0,
      metrics: await getTodayMetrics(),
    };
  }
}
