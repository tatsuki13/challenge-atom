import type { MemoryResolutionInput } from "@/lib/conversationTypes";
import { getCurrentUser } from "@/lib/auth";
import {
  isMemoryResolutionAction,
  isMemoryResolutionActor,
  isMemoryResolutionReasonCode,
} from "@/lib/memoryResolutionRules";
import { resolveMemoryCandidate } from "@/lib/memoryResolutionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStoreHeaders });
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: noStoreHeaders });
  }

  if (body.profileId !== undefined && body.profileId !== user.profileId) {
    return Response.json(
      { error: "Profile is not available.", reasonCode: "profile_mismatch" },
      { status: 403, headers: noStoreHeaders },
    );
  }
  if (
    typeof body.candidateId !== "string" ||
    body.candidateId.length === 0 ||
    body.candidateId.length > 200 ||
    !isMemoryResolutionAction(body.action) ||
    !isMemoryResolutionActor(body.actor) ||
    !isMemoryResolutionReasonCode(body.reasonCode) ||
    (body.targetMemoryId !== undefined &&
      body.targetMemoryId !== null &&
      (typeof body.targetMemoryId !== "string" || body.targetMemoryId.length > 200)) ||
    (body.reviewedContent !== undefined && typeof body.reviewedContent !== "string")
  ) {
    return Response.json(
      { error: "Invalid resolution input.", reasonCode: "invalid_candidate" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const input: MemoryResolutionInput = {
    profileId: user.profileId,
    candidateId: body.candidateId,
    action: body.action,
    actor: body.actor,
    reasonCode: body.reasonCode,
    targetMemoryId:
      typeof body.targetMemoryId === "string" ? body.targetMemoryId : null,
    reviewedContent:
      typeof body.reviewedContent === "string" ? body.reviewedContent : undefined,
  };

  try {
    const result = await resolveMemoryCandidate(input);
    if (!result.ok) {
      const status = result.reasonCode === "profile_mismatch" ? 403 : 409;
      return Response.json(result, { status, headers: noStoreHeaders });
    }
    return Response.json(result, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "Memory resolution failed without changing data." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
