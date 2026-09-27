import { getCurrentUser } from "@/lib/auth";
import { getLatestPhysicalSignals, savePhysicalSignals } from "@/lib/healthSamples";
import { getTokyoDateKey } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function optionalInteger(value: unknown, max: number) {
  return value === null || value === undefined
    ? null
    : typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max
      ? value
      : undefined;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  try {
    return Response.json(await getLatestPhysicalSignals(user.profileId), { headers });
  } catch {
    return Response.json({ error: "health_read_failed" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const date = body.date;
  const sleepMinutes = optionalInteger(body.sleepMinutes, 1440);
  const steps = optionalInteger(body.steps, 200000);
  const restingHeartRate = optionalInteger(body.restingHeartRate, 300);
  const parsedDate = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : null;
  if (
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !parsedDate || Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date || date > getTokyoDateKey() ||
    sleepMinutes === undefined || steps === undefined || restingHeartRate === undefined ||
    restingHeartRate === 0 ||
    (sleepMinutes === null && steps === null && restingHeartRate === null)
  ) {
    return Response.json({ error: "invalid_health_sample" }, { status: 400, headers });
  }
  try {
    await savePhysicalSignals(user.profileId, {
      date,
      sleepMinutes,
      steps,
      restingHeartRate,
      source: "import",
      recordedAt: new Date(),
    });
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "health_save_failed" }, { status: 503, headers });
  }
}
