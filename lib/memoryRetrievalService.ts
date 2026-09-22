import { searchActiveMemories } from "./ai/memoryRetrieval";
import { listDemoMemories } from "./demoStore";
import { getPrismaClient } from "./prisma";
import type {
  MemoryRetrievalRequest,
  StorageMode,
  StoredMemory,
} from "./conversationTypes";

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

export async function retrieveConfirmedMemories({
  profileId,
  storageBackend,
  request,
}: {
  profileId: string;
  storageBackend: StorageMode;
  request: MemoryRetrievalRequest;
}) {
  const memories =
    storageBackend === "memory"
      ? listDemoMemories(profileId)
      : await (async () => {
          const prisma = getPrismaClient();
          if (!prisma) throw new Error("Database storage is unavailable.");
          const rows = await prisma.memory.findMany({
            where: { profileId, status: "active" },
            orderBy: [{ normalizedKey: "asc" }, { id: "asc" }],
          });
          return rows.map(toStoredMemory);
        })();

  return searchActiveMemories({ memories, request, profileId });
}
