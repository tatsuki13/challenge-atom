import { getTodayMetrics } from "@/lib/conversationStore";

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
  const metrics = await getTodayMetrics();

  return Response.json(metrics, {
    headers: noStoreHeaders,
  });
}
