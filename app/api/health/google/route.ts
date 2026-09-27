import { getCurrentUser } from "@/lib/auth";
import { disconnectGoogleHealth, getGoogleHealthConnectionStatus, syncGoogleHealth } from "@/lib/googleHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  try {
    return Response.json(await getGoogleHealthConnectionStatus(user.profileId), { headers });
  } catch {
    return Response.json({ error: "connection_status_failed" }, { status: 503, headers });
  }
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  try {
    return Response.json(await syncGoogleHealth(user.profileId, true), { headers });
  } catch {
    return Response.json({ error: "sync_failed" }, { status: 503, headers });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  try {
    await disconnectGoogleHealth(user.profileId);
    return Response.json({ connected: false }, { headers });
  } catch {
    return Response.json({ error: "disconnect_failed" }, { status: 503, headers });
  }
}
