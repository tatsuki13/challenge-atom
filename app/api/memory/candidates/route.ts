import { listUnresolvedMemoryCandidates } from "@/lib/memoryResolutionService";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStoreHeaders });
  const profileId = new URL(request.url).searchParams.get("profileId") ?? user.profileId;
  if (profileId !== user.profileId) {
    return Response.json(
      { error: "Profile is not available.", reasonCode: "profile_mismatch" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    const candidates = await listUnresolvedMemoryCandidates(user.profileId);
    return Response.json({ profileId: user.profileId, candidates }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "Failed to load memory candidates." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
