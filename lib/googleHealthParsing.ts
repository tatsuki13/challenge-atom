function boundedInt(value: unknown, max: number) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

export function parseGoogleHealthSample(
  stepsResponse: Record<string, unknown> | null,
  sleepResponse: Record<string, unknown> | null,
  heartResponse: Record<string, unknown> | null,
) {
  const stepPoints = Array.isArray(stepsResponse?.rollupDataPoints) ? stepsResponse.rollupDataPoints : [];
  const steps = stepPoints.length
    ? boundedInt((stepPoints[0] as { steps?: { countSum?: unknown } }).steps?.countSum, 200000)
    : null;
  const sleepPoints = Array.isArray(sleepResponse?.dataPoints) ? sleepResponse.dataPoints : [];
  const mainSleep = sleepPoints.find((point) => (point as { sleep?: { metadata?: { main?: boolean } } }).sleep?.metadata?.main) ?? sleepPoints[0];
  const sleepMinutes = mainSleep
    ? boundedInt((mainSleep as { sleep?: { summary?: { minutesAsleep?: unknown } } }).sleep?.summary?.minutesAsleep, 1440)
    : null;
  const heartPoints = Array.isArray(heartResponse?.dataPoints) ? heartResponse.dataPoints : [];
  const restingHeartRate = heartPoints.length
    ? boundedInt((heartPoints[0] as { dailyRestingHeartRate?: { beatsPerMinute?: unknown } }).dailyRestingHeartRate?.beatsPerMinute, 300)
    : null;
  return { sleepMinutes, steps, restingHeartRate: restingHeartRate === 0 ? null : restingHeartRate };
}
