import { DEMO_PROFILE_ID } from "@/lib/conversationTypes";
import { listPendingMemoryManagementRequests } from "@/lib/memoryManagementService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const requestedProfile = new URL(request.url).searchParams.get("profileId");
  if (requestedProfile && requestedProfile !== DEMO_PROFILE_ID) {
    return Response.json({ error: "Profile is not available.", reasonCode: "profile_mismatch" }, { status: 403, headers });
  }
  try {
    const requests = await listPendingMemoryManagementRequests(DEMO_PROFILE_ID);
    return Response.json({ profileId: DEMO_PROFILE_ID, requests }, { headers });
  } catch {
    return Response.json({ error: "Failed to load memory requests." }, { status: 500, headers });
  }
}
