import {
  listDemoAllMemories,
  listDemoMemoryManagementActions,
  listDemoMemoryManagementRequests,
  listDemoMemoryUsagesForProfile,
  manageDemoMemory,
  resolveDemoMemoryManagementRequest,
  getDemoMemoryProvenance,
  getDemoMessageById,
} from "./demoStore";
import { getPrismaClient } from "./prisma";
import { normalizeReviewedMemoryContent } from "./memoryResolutionRules";
import { validateMemoryManagementInput } from "./memoryManagementRules";
import type {
  MemoryManagementInput,
  MemoryManagementRequestResolutionInput,
  MemoryManagementResult,
  StoredMemory,
  StoredMemoryManagementAction,
  StoredMemoryManagementRequest,
} from "./conversationTypes";

type PrismaClientInstance = NonNullable<ReturnType<typeof getPrismaClient>>;
type TransactionClient = Parameters<Parameters<PrismaClientInstance["$transaction"]>[0]>[0];

export type MemoryUsageView = {
  createdAt: Date;
  assistantReply: string;
  usageReason: string;
  retrievalScore: number;
};

export type ManagedMemoryHistoryItem = {
  memory: StoredMemory;
  evidence: Array<{ id: string; content: string; createdAt: Date }>;
  candidateContent: string | null;
  resolutionAction: string | null;
  managementActions: StoredMemoryManagementAction[];
  usages: MemoryUsageView[];
};

export type ManagedMemoryItem = ManagedMemoryHistoryItem & {
  history: ManagedMemoryHistoryItem[];
};

export type MemoryManagementRequestView = {
  request: StoredMemoryManagementRequest;
  sourceMessage: { id: string; content: string; createdAt: Date };
  matches: StoredMemory[];
};

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

function toStoredAction(action: {
  id: string;
  requestKey: string;
  profileId: string;
  targetMemoryId: string;
  action: string;
  resultMemoryId: string | null;
  actor: string;
  reasonCode: string;
  createdAt: Date;
}): StoredMemoryManagementAction {
  return {
    ...action,
    action: action.action as StoredMemoryManagementAction["action"],
    actor: action.actor as StoredMemoryManagementAction["actor"],
    reasonCode: action.reasonCode as StoredMemoryManagementAction["reasonCode"],
  };
}

function hasActiveSuccessor(memories: StoredMemory[], memoryId: string) {
  const children = new Map<string, StoredMemory[]>();
  for (const memory of memories) {
    if (!memory.supersedesId) continue;
    const group = children.get(memory.supersedesId) ?? [];
    group.push(memory);
    children.set(memory.supersedesId, group);
  }
  const pending = [...(children.get(memoryId) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const memory = pending.pop()!;
    if (visited.has(memory.id)) continue;
    visited.add(memory.id);
    if (memory.status === "active") return true;
    pending.push(...(children.get(memory.id) ?? []));
  }
  return false;
}

async function readExistingAction(
  transaction: TransactionClient,
  input: MemoryManagementInput,
): Promise<MemoryManagementResult | null> {
  const existing = await transaction.memoryManagementAction.findUnique({
    where: { requestKey: input.requestKey },
    include: { targetMemory: true, resultMemory: true },
  });
  if (!existing) return null;
  if (existing.profileId !== input.profileId || existing.targetMemoryId !== input.memoryId || existing.action !== input.action) {
    return { ok: false, reasonCode: "invalid_input", message: "Request key is already in use." };
  }
  return {
    ok: true,
    outcome: "already_applied",
    action: toStoredAction(existing),
    memory: toStoredMemory(existing.resultMemory ?? existing.targetMemory),
    previousMemory: existing.resultMemory ? toStoredMemory(existing.targetMemory) : null,
  };
}

async function applyMemoryManagement(
  transaction: TransactionClient,
  input: MemoryManagementInput,
): Promise<MemoryManagementResult> {
  const existing = await readExistingAction(transaction, input);
  if (existing) return existing;
  const invalid = validateMemoryManagementInput(input);
  if (invalid) return { ok: false, reasonCode: "invalid_input", message: invalid };
  const targetRow = await transaction.memory.findUnique({ where: { id: input.memoryId } });
  if (!targetRow) return { ok: false, reasonCode: "memory_not_found", message: "Memory was not found." };
  if (targetRow.profileId !== input.profileId) {
    return { ok: false, reasonCode: "profile_mismatch", message: "Memory profile mismatch." };
  }
  const target = toStoredMemory(targetRow);
  if ((input.action === "EDIT" || input.action === "ARCHIVE") && target.status !== "active") {
    return { ok: false, reasonCode: "invalid_status", message: "Only an active memory can be changed." };
  }
  if (input.action === "RESTORE" && target.status !== "archived") {
    return { ok: false, reasonCode: "invalid_status", message: "Only an archived memory can be restored." };
  }
  if (input.action === "RESTORE") {
    const rows = await transaction.memory.findMany({ where: { profileId: input.profileId } });
    if (hasActiveSuccessor(rows.map(toStoredMemory), target.id)) {
      return { ok: false, reasonCode: "active_successor", message: "A newer active memory exists." };
    }
  }

  let resultMemory = target;
  let previousMemory: StoredMemory | null = null;
  let resultMemoryId: string | null = null;
  if (input.action === "EDIT") {
    const reviewed = normalizeReviewedMemoryContent(input.reviewedContent);
    if (!reviewed.ok) return { ok: false, reasonCode: "invalid_input", message: reviewed.message };
    const updated = await transaction.memory.updateMany({
      where: { id: target.id, profileId: input.profileId, status: "active" },
      data: { status: "superseded" },
    });
    if (updated.count !== 1) {
      return { ok: false, reasonCode: "invalid_status", message: "Memory changed before this request completed." };
    }
    const created = await transaction.memory.create({
      data: {
        profileId: target.profileId,
        category: target.category,
        content: reviewed.content,
        normalizedKey: reviewed.normalizedKey,
        polarity: target.polarity,
        temporalScope: target.temporalScope,
        status: "active",
        supersedesId: target.id,
      },
    });
    previousMemory = { ...target, status: "superseded", updatedAt: new Date() };
    resultMemory = toStoredMemory(created);
    resultMemoryId = created.id;
  } else {
    const nextStatus = input.action === "ARCHIVE" ? "archived" : "active";
    const updated = await transaction.memory.updateMany({
      where: { id: target.id, profileId: input.profileId, status: target.status },
      data: { status: nextStatus },
    });
    if (updated.count !== 1) {
      return { ok: false, reasonCode: "invalid_status", message: "Memory changed before this request completed." };
    }
    resultMemory = { ...target, status: nextStatus, updatedAt: new Date() };
  }
  const action = await transaction.memoryManagementAction.create({
    data: {
      requestKey: input.requestKey,
      profileId: input.profileId,
      targetMemoryId: target.id,
      action: input.action,
      resultMemoryId,
      actor: input.actor,
      reasonCode: input.reasonCode,
    },
  });
  return {
    ok: true,
    outcome: "applied",
    action: toStoredAction(action),
    memory: resultMemory,
    previousMemory,
  };
}

export async function manageMemory(input: MemoryManagementInput) {
  const prisma = getPrismaClient();
  if (!prisma) return manageDemoMemory(input);
  try {
    return await prisma.$transaction((transaction) => applyMemoryManagement(transaction, input));
  } catch (error) {
    const existing = await readExistingAction(prisma, input);
    if (existing) return existing;
    throw error;
  }
}

export async function listManagedMemories(profileId: string) {
  const prisma = getPrismaClient();
  if (!prisma) {
    const memories = listDemoAllMemories(profileId);
    const actions = listDemoMemoryManagementActions(profileId);
    const usages = listDemoMemoryUsagesForProfile(profileId);
    const byId = new Map(memories.map((memory) => [memory.id, memory]));
    const findProvenance = (memory: StoredMemory) => {
      let current: StoredMemory | undefined = memory;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const provenance = getDemoMemoryProvenance(current.id);
        if (provenance.resolution) return provenance;
        current = current.supersedesId ? byId.get(current.supersedesId) : undefined;
      }
      return null;
    };
    const toItem = (memory: StoredMemory): ManagedMemoryHistoryItem => {
      const provenance = findProvenance(memory);
      return {
        memory,
        evidence:
          provenance?.evidence.map((message) => ({
            id: message.id,
            content: message.content,
            createdAt: message.createdAt,
          })) ?? [],
        candidateContent: provenance?.candidate?.content ?? null,
        resolutionAction: provenance?.resolution?.action ?? null,
        managementActions: actions.filter(
          (action) => action.targetMemoryId === memory.id || action.resultMemoryId === memory.id,
        ),
        usages: usages
          .filter((usage) => usage.memoryId === memory.id)
          .map((usage) => ({
            createdAt: usage.createdAt,
            assistantReply: getDemoMessageById(usage.assistantMessageId)?.content ?? "返答を確認できません。",
            usageReason: usage.usageReason,
            retrievalScore: usage.retrievalScore,
          })),
      };
    };
    const heads = memories.filter(
      (memory) =>
        (memory.status === "active" || memory.status === "archived") &&
        !memories.some((candidate) => candidate.supersedesId === memory.id),
    );
    const items = heads.map((memory) => {
      const history: ManagedMemoryHistoryItem[] = [];
      let previousId = memory.supersedesId;
      const visited = new Set<string>();
      while (previousId && !visited.has(previousId)) {
        visited.add(previousId);
        const previous = byId.get(previousId);
        if (!previous) break;
        history.push(toItem(previous));
        previousId = previous.supersedesId;
      }
      return { ...toItem(memory), history };
    });
    return {
      active: items.filter((item) => item.memory.status === "active"),
      archived: items.filter((item) => item.memory.status === "archived"),
    };
  }

  const rows = await prisma.memory.findMany({
    where: { profileId },
    include: {
      createdByResolution: {
        include: {
          candidate: {
            include: { evidence: { include: { sourceMessage: true } } },
          },
        },
      },
      managementTargets: true,
      managementResults: true,
      usages: {
        include: {
          assistantMessage: { include: { conversation: { select: { profileId: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const findProvenance = (row: (typeof rows)[number]) => {
    let current: (typeof rows)[number] | undefined = row;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.createdByResolution) return current.createdByResolution;
      current = current.supersedesId ? byId.get(current.supersedesId) : undefined;
    }
    return null;
  };
  const toItem = (row: (typeof rows)[number]): ManagedMemoryHistoryItem => {
    const provenance = findProvenance(row);
    return {
    memory: toStoredMemory(row),
    evidence:
      provenance?.candidate.evidence.map(({ sourceMessage }) => ({
        id: sourceMessage.id,
        content: sourceMessage.content,
        createdAt: sourceMessage.createdAt,
      })) ?? [],
    candidateContent: provenance?.candidate.content ?? null,
    resolutionAction: provenance?.action ?? null,
    managementActions: [...row.managementTargets, ...row.managementResults]
      .filter((action, index, actions) => actions.findIndex((item) => item.id === action.id) === index)
      .map(toStoredAction),
    usages: row.usages
      .filter((usage) => usage.assistantMessage.conversation.profileId === profileId)
      .map((usage) => ({
        createdAt: usage.createdAt,
        assistantReply: usage.assistantMessage.content,
        usageReason: usage.usageReason,
        retrievalScore: usage.retrievalScore,
      })),
    };
  };
  const heads = rows.filter(
    (row) =>
      (row.status === "active" || row.status === "archived") &&
      !rows.some((candidate) => candidate.supersedesId === row.id),
  );
  const items: ManagedMemoryItem[] = heads.map((row) => {
    const history: ManagedMemoryHistoryItem[] = [];
    const visited = new Set<string>();
    let previousId = row.supersedesId;
    while (previousId && !visited.has(previousId)) {
      visited.add(previousId);
      const previous = byId.get(previousId);
      if (!previous) break;
      history.push(toItem(previous));
      previousId = previous.supersedesId;
    }
    return { ...toItem(row), history };
  });
  return {
    active: items.filter((item) => item.memory.status === "active"),
    archived: items.filter((item) => item.memory.status === "archived"),
  };
}

export async function listPendingMemoryManagementRequests(profileId: string): Promise<MemoryManagementRequestView[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    const memories = listDemoAllMemories(profileId);
    return listDemoMemoryManagementRequests(profileId)
      .filter((request) => request.status === "pending")
      .map((request) => ({
        request,
        sourceMessage: getDemoMessageById(request.sourceMessageId) ?? {
          id: request.sourceMessageId,
          content: "発言を確認できません。",
          createdAt: request.createdAt,
        },
        matches: request.matches
          .map((match) => memories.find((memory) => memory.id === match.memoryId))
          .filter((memory): memory is StoredMemory => Boolean(memory)),
      }));
  }
  const rows = await prisma.memoryManagementRequest.findMany({
    where: { profileId, status: "pending" },
    include: {
      sourceMessage: { select: { id: true, content: true, createdAt: true } },
      matches: { include: { memory: true }, orderBy: [{ score: "desc" }, { memoryId: "asc" }] },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    request: {
      id: row.id,
      profileId: row.profileId,
      conversationId: row.conversationId,
      sourceMessageId: row.sourceMessageId,
      decisionId: row.decisionId,
      intent: row.intent as StoredMemoryManagementRequest["intent"],
      category: row.category as StoredMemoryManagementRequest["category"],
      searchTerms: Array.isArray(row.searchTerms) ? (row.searchTerms as string[]) : [],
      correctedContent: row.correctedContent,
      matches: row.matches.map((match) => ({ memoryId: match.memoryId, score: match.score })),
      status: row.status as StoredMemoryManagementRequest["status"],
      selectedMemoryId: row.selectedMemoryId,
      managementActionId: row.managementActionId,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
    },
    sourceMessage: row.sourceMessage,
    matches: row.matches.map((match) => toStoredMemory(match.memory)),
  }));
}

export async function resolveMemoryManagementRequest(
  input: MemoryManagementRequestResolutionInput,
) {
  const prisma = getPrismaClient();
  if (!prisma) return resolveDemoMemoryManagementRequest(input);
  try {
    return await prisma.$transaction(async (transaction) => {
    const request = await transaction.memoryManagementRequest.findUnique({
      where: { id: input.requestId },
      include: { matches: true },
    });
    if (!request) return { ok: false as const, reasonCode: "request_not_found", message: "Request was not found." };
    if (request.profileId !== input.profileId) {
      return { ok: false as const, reasonCode: "profile_mismatch", message: "Request profile mismatch." };
    }
    if (request.status !== "pending") {
      return { ok: true as const, outcome: "already_processed" as const };
    }
    if (!input.approve && (input.selectedMemoryId || input.reviewedContent !== undefined)) {
      return { ok: false as const, reasonCode: "invalid_input", message: "A rejected request must not include changes." };
    }
    if (!input.approve) {
      await transaction.memoryManagementRequest.update({
        where: { id: request.id, status: "pending" },
        data: { status: "rejected", processedAt: new Date() },
      });
      return { ok: true as const, outcome: "processed" as const };
    }
    if (!input.selectedMemoryId || !request.matches.some((match) => match.memoryId === input.selectedMemoryId)) {
      return { ok: false as const, reasonCode: "invalid_target", message: "Select one of the matched memories." };
    }
    if (request.intent === "FORGET" && input.reviewedContent !== undefined) {
      return { ok: false as const, reasonCode: "invalid_input", message: "A forget request must not include edited content." };
    }
    const action = request.intent === "CORRECT" ? "EDIT" : "ARCHIVE";
    const managed = await applyMemoryManagement(transaction, {
      profileId: input.profileId,
      requestKey: `management-request:${request.id}`,
      memoryId: input.selectedMemoryId,
      action,
      actor: "user",
      reasonCode: request.intent === "CORRECT" ? "conversation_correction" : "conversation_forget",
      ...(action === "EDIT"
        ? { reviewedContent: input.reviewedContent ?? request.correctedContent ?? undefined }
        : {}),
    });
    if (!managed.ok) return managed;
    await transaction.memoryManagementRequest.update({
      where: { id: request.id, status: "pending" },
      data: {
        status: "approved",
        selectedMemoryId: input.selectedMemoryId,
        managementActionId: managed.action.id,
        processedAt: new Date(),
      },
    });
    return { ok: true as const, outcome: "processed" as const, management: managed };
    });
  } catch (error) {
    const request = await prisma.memoryManagementRequest.findUnique({
      where: { id: input.requestId },
      select: { profileId: true, status: true },
    });
    if (request?.profileId === input.profileId && request.status !== "pending") {
      return { ok: true as const, outcome: "already_processed" as const };
    }
    throw error;
  }
}
