"use server";

import { getTodayMetrics } from "@/lib/conversationStore";
import { getPrismaClient } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function getData() {
  const user = await getCurrentUser();
  if (!user) throw new Error("authentication_required");
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      connected: false,
      profileCount: 0,
      conversationCount: 0,
      messageCount: 0,
      metrics: await getTodayMetrics(user.profileId),
    };
  }

  try {
    const [profileCount, conversationCount, messageCount, metrics] =
      await Promise.all([
        prisma.profile.count({ where: { id: user.profileId } }),
        prisma.conversation.count({ where: { profileId: user.profileId } }),
        prisma.message.count({ where: { conversation: { profileId: user.profileId } } }),
        getTodayMetrics(user.profileId),
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
      metrics: await getTodayMetrics(user.profileId),
    };
  }
}
