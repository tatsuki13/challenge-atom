import { DEMO_PROFILE_ID } from "@/lib/conversationTypes";
import { listManagedMemories } from "@/lib/memoryManagementService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const requestedProfile = new URL(request.url).searchParams.get("profileId");
  if (requestedProfile && requestedProfile !== DEMO_PROFILE_ID) {
    return Response.json(
      { error: "Profile is not available.", reasonCode: "profile_mismatch" },
      { status: 403, headers },
    );
  }
  try {
    const memories = await listManagedMemories(DEMO_PROFILE_ID);
    return Response.json({ profileId: DEMO_PROFILE_ID, ...memories }, { headers });
  } catch {
    return Response.json({ error: "Failed to load memories." }, { status: 500, headers });
  }
}
