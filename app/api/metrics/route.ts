import { getTodayMetrics } from "@/lib/conversationStore";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "authentication_required" }, { status: 401, headers: noStoreHeaders });
  }
  const metrics = await getTodayMetrics(user.profileId);

  return Response.json(metrics, {
    headers: noStoreHeaders,
  });
}
