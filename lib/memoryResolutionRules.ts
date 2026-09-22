import type {
  MemoryResolutionAction,
  MemoryResolutionActor,
  MemoryResolutionInput,
  MemoryResolutionReasonCode,
  StoredMemory,
  StoredMemoryCandidate,
} from "./conversationTypes";

export const MAX_REVIEWED_MEMORY_CONTENT_LENGTH = 240;

export const memoryResolutionActions = new Set<MemoryResolutionAction>([
  "ADD",
  "UPDATE",
  "SUPERSEDE",
  "IGNORE",
]);

export const memoryResolutionActors = new Set<MemoryResolutionActor>([
  "system",
  "user",
]);

export const memoryResolutionReasonCodes = new Set<MemoryResolutionReasonCode>([
  "new_memory",
  "exact_duplicate",
  "content_update",
  "explicit_correction",
  "explicit_replacement",
  "user_rejected",
  "invalid_candidate",
  "already_resolved",
  "target_not_found",
  "profile_mismatch",
]);

const allowedReasons: Record<MemoryResolutionAction, Set<MemoryResolutionReasonCode>> = {
  ADD: new Set(["new_memory"]),
  UPDATE: new Set(["content_update", "explicit_correction"]),
  SUPERSEDE: new Set(["explicit_correction", "explicit_replacement"]),
  IGNORE: new Set(["exact_duplicate", "user_rejected", "invalid_candidate"]),
};

export function isMemoryResolutionAction(value: unknown): value is MemoryResolutionAction {
  return typeof value === "string" && memoryResolutionActions.has(value as MemoryResolutionAction);
}

export function isMemoryResolutionActor(value: unknown): value is MemoryResolutionActor {
  return typeof value === "string" && memoryResolutionActors.has(value as MemoryResolutionActor);
}

export function isMemoryResolutionReasonCode(
  value: unknown,
): value is MemoryResolutionReasonCode {
  return (
    typeof value === "string" &&
    memoryResolutionReasonCodes.has(value as MemoryResolutionReasonCode)
  );
}

export function findExactDuplicate(
  candidate: StoredMemoryCandidate,
  memories: StoredMemory[],
) {
  return (
    memories.find(
      (memory) =>
        memory.status === "active" &&
        memory.profileId === candidate.profileId &&
        memory.category === candidate.category &&
        memory.normalizedKey === candidate.normalizedKey &&
        memory.content === candidate.content &&
        memory.polarity === candidate.polarity &&
        memory.temporalScope === candidate.temporalScope,
    ) ?? null
  );
}

export function normalizeMemoryKey(content: string) {
  return content
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .slice(0, 120);
}

export function normalizeReviewedMemoryContent(content: unknown):
  | { ok: true; content: string; normalizedKey: string }
  | { ok: false; message: string } {
  if (typeof content !== "string") {
    return { ok: false, message: "記憶する文章を入力してください。" };
  }
  const normalizedContent = content.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return { ok: false, message: "記憶する文章を入力してください。" };
  }
  if (normalizedContent.length > MAX_REVIEWED_MEMORY_CONTENT_LENGTH) {
    return {
      ok: false,
      message: `記憶する文章は${MAX_REVIEWED_MEMORY_CONTENT_LENGTH}文字以内で入力してください。`,
    };
  }
  const normalizedKey = normalizeMemoryKey(normalizedContent);
  if (!normalizedKey) {
    return { ok: false, message: "記憶する文章に文字を含めてください。" };
  }
  return { ok: true, content: normalizedContent, normalizedKey };
}

export function getReviewedCandidate(
  candidate: StoredMemoryCandidate,
  reviewedContent: string | undefined,
):
  | { ok: true; candidate: StoredMemoryCandidate; reviewedContent: string }
  | { ok: false; message: string } {
  const reviewed = normalizeReviewedMemoryContent(reviewedContent ?? candidate.content);
  if (!reviewed.ok) return reviewed;
  const { content, normalizedKey } = reviewed;

  return {
    ok: true,
    reviewedContent: content,
    candidate: {
      ...candidate,
      content,
      normalizedKey,
    },
  };
}

export function validateResolutionCombination(input: MemoryResolutionInput) {
  const hasTarget = Boolean(input.targetMemoryId);

  if ((input.action === "UPDATE" || input.action === "SUPERSEDE") && !hasTarget) {
    return "UPDATE and SUPERSEDE require targetMemoryId.";
  }

  if ((input.action === "ADD" || input.action === "IGNORE") && hasTarget) {
    return "ADD and IGNORE must not include targetMemoryId.";
  }

  if (!allowedReasons[input.action].has(input.reasonCode)) {
    return `reasonCode is not valid for ${input.action}.`;
  }

  return null;
}

export function getAllowedResolutionActions(
  candidate: StoredMemoryCandidate,
  activeMemories: StoredMemory[],
): MemoryResolutionAction[] {
  if (candidate.status !== "candidate") {
    return [];
  }

  return findExactDuplicate(candidate, activeMemories)
    ? ["IGNORE"]
    : ["ADD", "UPDATE", "SUPERSEDE", "IGNORE"];
}
