import "server-only";

import { addUtcDays, dateKeyToUtcDate, getTokyoDateKey } from "./date";
import { getPrismaClient } from "./prisma";
import type { PhysicalSignals } from "./wellbeing";

export async function getLatestPhysicalSignals(profileId: string): Promise<PhysicalSignals | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const today = dateKeyToUtcDate(getTokyoDateKey());
  const samples = await prisma.healthSample.findMany({
    where: { profileId, date: { gte: today, lt: addUtcDays(today, 1) } },
    orderBy: { recordedAt: "desc" },
  });
  return samples.length ? {
    sleepMinutes: samples.find((sample) => sample.sleepMinutes !== null)?.sleepMinutes ?? null,
    steps: samples.find((sample) => sample.steps !== null)?.steps ?? null,
    restingHeartRate: samples.find((sample) => sample.restingHeartRate !== null)?.restingHeartRate ?? null,
    recordedAt: samples[0].recordedAt.toISOString(),
    source: samples[0].source,
  } : null;
}

export async function savePhysicalSignals(profileId: string, value: {
  date: string;
  sleepMinutes: number | null;
  steps: number | null;
  restingHeartRate: number | null;
  source: string;
  recordedAt: Date;
  preserveMissing?: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("database_unavailable");
  const date = dateKeyToUtcDate(value.date);
  return prisma.healthSample.upsert({
    where: { profileId_date_source: { profileId, date, source: value.source } },
    create: {
      profileId,
      date,
      sleepMinutes: value.sleepMinutes,
      steps: value.steps,
      restingHeartRate: value.restingHeartRate,
      source: value.source,
      recordedAt: value.recordedAt,
    },
    update: {
      sleepMinutes: value.preserveMissing && value.sleepMinutes === null ? undefined : value.sleepMinutes,
      steps: value.preserveMissing && value.steps === null ? undefined : value.steps,
      restingHeartRate: value.preserveMissing && value.restingHeartRate === null ? undefined : value.restingHeartRate,
      recordedAt: value.recordedAt,
    },
  });
}
