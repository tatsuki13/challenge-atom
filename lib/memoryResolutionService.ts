import {
  getDemoEvidenceMessages,
  listDemoMemories,
  listDemoMemoryCandidates,
  resolveDemoMemoryCandidate,
} from "./demoStore";
import { getPrismaClient } from "./prisma";
import {
  findExactDuplicate,
  getReviewedCandidate,
  getAllowedResolutionActions,
  validateResolutionCombination,
} from "./memoryResolutionRules";
import type {
  ExtractedMemoryCandidate,
  MemoryResolutionInput,
  MemoryResolutionResult,
  StoredChatMessage,
  StoredMemory,
  StoredMemoryCandidate,
  StoredMemoryResolution,
} from "./conversationTypes";

type EvidenceView = Pick<StoredChatMessage, "id" | "content" | "createdAt">;

export type MemoryCandidateReviewItem = {
  candidate: StoredMemoryCandidate;
  evidence: EvidenceView[];
  comparisonMemories: StoredMemory[];
  exactDuplicateMemoryId: string | null;
  allowedActions: ReturnType<typeof getAllowedResolutionActions>;
  processed: false;
};

function toStoredCandidate(candidate: {
  id: string;
  profileId: string;
  conversationId: string;
  decisionId: string;
  category: string;
  content: string;
  normalizedKey: string;
  subject: string;
  assertion: string;
  polarity: string;
  temporalScope: string;
  confidence: number;
  status: string;
  extractionVersion: string;
  createdAt: Date;
  evidence?: { sourceMessageId: string }[];
}): StoredMemoryCandidate {
  return {
    id: candidate.id,
    profileId: candidate.profileId,
    conversationId: candidate.conversationId,
    decisionId: candidate.decisionId,
    category: candidate.category as ExtractedMemoryCandidate["category"],
    content: candidate.content,
    normalizedKey: candidate.normalizedKey,
    subject: candidate.subject as ExtractedMemoryCandidate["subject"],
    assertion: candidate.assertion as ExtractedMemoryCandidate["assertion"],
    polarity: candidate.polarity as ExtractedMemoryCandidate["polarity"],
    temporalScope: candidate.temporalScope as ExtractedMemoryCandidate["temporalScope"],
    confidence: candidate.confidence,
    status: candidate.status as StoredMemoryCandidate["status"],
    extractionVersion: candidate.extractionVersion,
    sourceUtteranceIds: candidate.evidence?.map((item) => item.sourceMessageId) ?? [],
    createdAt: candidate.createdAt,
  };
}

function toStoredMemory(memory: {
  id: string;
  profileId: string;
  category: string;
  content: string;
  normalizedKey: string;
  polarity: string;
  temporalScope: string;
  status: string;
  supersedesId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredMemory {
  return {
    ...memory,
    category: memory.category as StoredMemory["category"],
    polarity: memory.polarity as StoredMemory["polarity"],
    temporalScope: memory.temporalScope as StoredMemory["temporalScope"],
    status: memory.status as StoredMemory["status"],
  };
}

function toStoredResolution(resolution: {
  id: string;
  candidateId: string;
  action: string;
  targetMemoryId: string | null;
  resultMemoryId: string | null;
  reasonCode: string;
  actor: string;
  reviewedContent?: string | null;
  reviewedNormalizedKey?: string | null;
  processedAt: Date;
}): StoredMemoryResolution {
  return {
    ...resolution,
    action: resolution.action as StoredMemoryResolution["action"],
    reasonCode: resolution.reasonCode as StoredMemoryResolution["reasonCode"],
    actor: resolution.actor as StoredMemoryResolution["actor"],
    reviewedContent: resolution.reviewedContent ?? null,
    reviewedNormalizedKey: resolution.reviewedNormalizedKey ?? null,
  };
}

function evidenceView(messages: StoredChatMessage[]): EvidenceView[] {
  return messages.map(({ id, content, createdAt }) => ({ id, content, createdAt }));
}

export async function listUnresolvedMemoryCandidates(
  profileId: string,
): Promise<MemoryCandidateReviewItem[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    const candidates = listDemoMemoryCandidates(profileId);
    const memories = listDemoMemories(profileId);
    return candidates.map((candidate) => {
      const comparisons = memories.filter(
        (memory) =>
          memory.category === candidate.category &&
          memory.normalizedKey === candidate.normalizedKey,
      );
      return {
        candidate,
        evidence: evidenceView(getDemoEvidenceMessages(candidate.sourceUtteranceIds)),
        comparisonMemories: comparisons,
        exactDuplicateMemoryId: findExactDuplicate(candidate, memories)?.id ?? null,
        allowedActions: getAllowedResolutionActions(candidate, memories),
        processed: false,
      };
    });
  }

  const [candidateRows, memoryRows] = await Promise.all([
    prisma.memoryCandidate.findMany({
      where: { profileId, status: "candidate", resolution: null },
      include: {
        evidence: {
          include: { sourceMessage: { select: { id: true, content: true, createdAt: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.memory.findMany({
      where: { profileId, status: "active" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const memories = memoryRows.map(toStoredMemory);

  return candidateRows.map((row) => {
    const candidate = toStoredCandidate(row);
    const comparisons = memories.filter(
      (memory) =>
        memory.category === candidate.category &&
        memory.normalizedKey === candidate.normalizedKey,
    );
    return {
      candidate,
      evidence: row.evidence.map(({ sourceMessage }) => sourceMessage),
      comparisonMemories: comparisons,
      exactDuplicateMemoryId: findExactDuplicate(candidate, memories)?.id ?? null,
      allowedActions: getAllowedResolutionActions(candidate, memories),
      processed: false,
    };
  });
}

async function readExistingResolution(
  candidateId: string,
): Promise<MemoryResolutionResult | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return null;
  }
  const resolution = await prisma.memoryResolution.findUnique({
    where: { candidateId },
    include: {
      candidate: { include: { evidence: true } },
      targetMemory: true,
      resultMemory: true,
    },
  });
  if (!resolution) {
    return null;
  }
  return {
    ok: true,
    outcome: "already_resolved",
    candidate: toStoredCandidate(resolution.candidate),
    resolution: toStoredResolution(resolution),
    memory: resolution.resultMemory ? toStoredMemory(resolution.resultMemory) : null,
    previousMemory: resolution.targetMemory ? toStoredMemory(resolution.targetMemory) : null,
  };
}

export async function resolveMemoryCandidate(
  input: MemoryResolutionInput,
): Promise<MemoryResolutionResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return resolveDemoMemoryCandidate(input);
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const candidateRow = await transaction.memoryCandidate.findUnique({
        where: { id: input.candidateId },
        include: { evidence: true, resolution: true },
      });
      if (!candidateRow) {
        return { ok: false, reasonCode: "invalid_candidate", message: "Candidate was not found." };
      }
      const candidate = toStoredCandidate(candidateRow);
      if (candidate.profileId !== input.profileId) {
        return { ok: false, reasonCode: "profile_mismatch", message: "Candidate profile mismatch." };
      }
      if (candidateRow.resolution) {
        const [targetMemory, resultMemory] = await Promise.all([
          candidateRow.resolution.targetMemoryId
            ? transaction.memory.findUnique({ where: { id: candidateRow.resolution.targetMemoryId } })
            : null,
          candidateRow.resolution.resultMemoryId
            ? transaction.memory.findUnique({ where: { id: candidateRow.resolution.resultMemoryId } })
            : null,
        ]);
        return {
          ok: true,
          outcome: "already_resolved",
          candidate,
          resolution: toStoredResolution(candidateRow.resolution),
          memory: resultMemory ? toStoredMemory(resultMemory) : null,
          previousMemory: targetMemory ? toStoredMemory(targetMemory) : null,
        };
      }
      if (candidate.status !== "candidate") {
        return { ok: false, reasonCode: "already_resolved", message: "Candidate is already processed." };
      }
      const invalidCombination = validateResolutionCombination(input);
      if (invalidCombination) {
        return { ok: false, reasonCode: "invalid_candidate", message: invalidCombination };
      }
      const reviewed = getReviewedCandidate(candidate, input.reviewedContent);
      if (!reviewed.ok) {
        return { ok: false, reasonCode: "invalid_candidate", message: reviewed.message };
      }
      const resolutionCandidate = reviewed.candidate;

      const activeRows = await transaction.memory.findMany({
        where: { profileId: input.profileId, status: "active" },
      });
      const activeMemories = activeRows.map(toStoredMemory);
      const exactDuplicate = findExactDuplicate(resolutionCandidate, activeMemories);
      const shouldIgnoreDuplicate =
        Boolean(exactDuplicate) &&
        (input.action === "ADD" ||
          (input.action === "IGNORE" && input.reasonCode === "exact_duplicate"));

      if (input.reasonCode === "exact_duplicate" && !exactDuplicate) {
        return { ok: false, reasonCode: "target_not_found", message: "No active exact duplicate exists." };
      }

      let targetMemory = null as StoredMemory | null;
      if (input.action === "UPDATE" || input.action === "SUPERSEDE") {
        const anyTarget = await transaction.memory.findUnique({
          where: { id: input.targetMemoryId! },
        });
        if (!anyTarget) {
          return { ok: false, reasonCode: "target_not_found", message: "Target memory was not found." };
        }
        if (anyTarget.profileId !== input.profileId) {
          return { ok: false, reasonCode: "profile_mismatch", message: "Target memory profile mismatch." };
        }
        if (anyTarget.status !== "active") {
          return { ok: false, reasonCode: "target_not_found", message: "Target memory is not active." };
        }
        targetMemory = toStoredMemory(anyTarget);
      }

      const effectiveAction = shouldIgnoreDuplicate ? "IGNORE" : input.action;
      const effectiveReason = shouldIgnoreDuplicate ? "exact_duplicate" : input.reasonCode;
      const effectiveActor = shouldIgnoreDuplicate ? "system" : input.actor;
      const effectiveTarget = shouldIgnoreDuplicate ? exactDuplicate : targetMemory;
      let resultMemory = null as StoredMemory | null;

      if (effectiveAction !== "IGNORE") {
        if (effectiveTarget) {
          const updatedTarget = await transaction.memory.update({
            where: { id: effectiveTarget.id, profileId: input.profileId, status: "active" },
            data: { status: "superseded" },
          });
          targetMemory = toStoredMemory(updatedTarget);
        }
        const createdMemory = await transaction.memory.create({
          data: {
            profileId: resolutionCandidate.profileId,
            category: resolutionCandidate.category,
            content: resolutionCandidate.content,
            normalizedKey: resolutionCandidate.normalizedKey,
            polarity: resolutionCandidate.polarity,
            temporalScope: resolutionCandidate.temporalScope,
            status: "active",
            supersedesId: effectiveTarget?.id ?? null,
          },
        });
        resultMemory = toStoredMemory(createdMemory);
      }

      const resolvedCandidate = await transaction.memoryCandidate.update({
        where: { id: candidate.id, status: "candidate" },
        data: { status: effectiveAction === "IGNORE" ? "ignored" : "confirmed" },
        include: { evidence: true },
      });
      const resolution = await transaction.memoryResolution.create({
        data: {
          candidateId: candidate.id,
          action: effectiveAction,
          targetMemoryId: effectiveTarget?.id ?? null,
          resultMemoryId: resultMemory?.id ?? null,
          reasonCode: effectiveReason,
          actor: effectiveActor,
          reviewedContent: reviewed.reviewedContent,
          reviewedNormalizedKey: resolutionCandidate.normalizedKey,
        },
      });

      return {
        ok: true,
        outcome: "resolved",
        candidate: toStoredCandidate(resolvedCandidate),
        resolution: toStoredResolution(resolution),
        memory: resultMemory,
        previousMemory: effectiveTarget ? targetMemory ?? effectiveTarget : null,
      };
    });
  } catch (error) {
    const existing = await readExistingResolution(input.candidateId);
    if (existing) {
      return existing;
    }
    throw error;
  }
}
