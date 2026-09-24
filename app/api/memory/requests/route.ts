import { listPendingMemoryManagementRequests } from "@/lib/memoryManagementService";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  const requestedProfile = new URL(request.url).searchParams.get("profileId");
  if (requestedProfile && requestedProfile !== user.profileId) {
    return Response.json({ error: "Profile is not available.", reasonCode: "profile_mismatch" }, { status: 403, headers });
  }
  try {
    const requests = await listPendingMemoryManagementRequests(user.profileId);
    return Response.json({ profileId: user.profileId, requests }, { headers });
  } catch {
    return Response.json({ error: "Failed to load memory requests." }, { status: 500, headers });
  }
}
