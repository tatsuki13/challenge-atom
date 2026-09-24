import { resolveMemoryManagementRequest } from "@/lib/memoryManagementService";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  if (body.profileId !== undefined && body.profileId !== user.profileId) {
    return Response.json({ error: "Profile is not available.", reasonCode: "profile_mismatch" }, { status: 403, headers });
  }
  if (
    typeof body.requestId !== "string" ||
    typeof body.approve !== "boolean" ||
    (body.selectedMemoryId !== undefined && typeof body.selectedMemoryId !== "string") ||
    (body.reviewedContent !== undefined && typeof body.reviewedContent !== "string")
  ) {
    return Response.json({ error: "Invalid request resolution input." }, { status: 400, headers });
  }
  try {
    const result = await resolveMemoryManagementRequest({
      profileId: user.profileId,
      requestId: body.requestId,
      approve: body.approve,
      ...(typeof body.selectedMemoryId === "string" ? { selectedMemoryId: body.selectedMemoryId } : {}),
      ...(typeof body.reviewedContent === "string" ? { reviewedContent: body.reviewedContent } : {}),
    });
    if (!result.ok) {
      const status = result.reasonCode === "profile_mismatch" ? 403 : 409;
      return Response.json(result, { status, headers });
    }
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Request resolution failed without changing data." }, { status: 500, headers });
  }
}
