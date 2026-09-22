import {
  DEMO_PROFILE_ID,
  type MemoryManagementInput,
} from "@/lib/conversationTypes";
import {
  isMemoryManagementAction,
  isMemoryManagementReasonCode,
} from "@/lib/memoryManagementRules";
import { manageMemory } from "@/lib/memoryManagementService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  if (body.profileId !== undefined && body.profileId !== DEMO_PROFILE_ID) {
    return Response.json({ error: "Profile is not available.", reasonCode: "profile_mismatch" }, { status: 403, headers });
  }
  if (
    typeof body.requestKey !== "string" ||
    typeof body.memoryId !== "string" ||
    !isMemoryManagementAction(body.action) ||
    body.actor !== "user" ||
    !isMemoryManagementReasonCode(body.reasonCode) ||
    (body.reviewedContent !== undefined && typeof body.reviewedContent !== "string")
  ) {
    return Response.json({ error: "Invalid management input.", reasonCode: "invalid_input" }, { status: 400, headers });
  }
  const input: MemoryManagementInput = {
    profileId: DEMO_PROFILE_ID,
    requestKey: body.requestKey,
    memoryId: body.memoryId,
    action: body.action,
    actor: "user",
    reasonCode: body.reasonCode,
    ...(typeof body.reviewedContent === "string" ? { reviewedContent: body.reviewedContent } : {}),
  };
  try {
    const result = await manageMemory(input);
    if (!result.ok) {
      const status = result.reasonCode === "profile_mismatch" ? 403 : 409;
      return Response.json(result, { status, headers });
    }
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Memory management failed without changing data." }, { status: 500, headers });
  }
}
