import { DEMO_PROFILE_ID } from "@/lib/conversationTypes";
import { listUnresolvedMemoryCandidates } from "@/lib/memoryResolutionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? DEMO_PROFILE_ID;
  if (profileId !== DEMO_PROFILE_ID) {
    return Response.json(
      { error: "Profile is not available.", reasonCode: "profile_mismatch" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    const candidates = await listUnresolvedMemoryCandidates(DEMO_PROFILE_ID);
    return Response.json({ profileId: DEMO_PROFILE_ID, candidates }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "Failed to load memory candidates." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
