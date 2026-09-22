import type {
  DetectedMemoryManagementRequest,
  MemoryCategory,
} from "../conversationTypes";
import { MAX_REVIEWED_MEMORY_CONTENT_LENGTH } from "../memoryResolutionRules";
import { MEMORY_RETRIEVAL_CONFIG } from "./memoryRetrieval";

const categories = new Set<MemoryCategory>([
  "person",
  "place",
  "experience",
  "preference",
  "routine",
  "wish",
]);

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function normalizeDetectedMemoryManagementRequest(
  value: unknown,
): DetectedMemoryManagementRequest | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.intent === "NONE") {
    return { intent: "NONE", category: null, searchTerms: [], correctedContent: null };
  }
  if (raw.intent !== "CORRECT" && raw.intent !== "FORGET") return null;
  if (typeof raw.category !== "string" || !categories.has(raw.category as MemoryCategory)) {
    return null;
  }
  if (!Array.isArray(raw.searchTerms)) return null;
  const searchTerms = raw.searchTerms
    .map((term) => normalizeText(term, MEMORY_RETRIEVAL_CONFIG.maxSearchTermLength))
    .filter((term): term is string => Boolean(term))
    .filter((term, index, values) => values.indexOf(term) === index)
    .slice(0, MEMORY_RETRIEVAL_CONFIG.maxSearchTerms);
  if (searchTerms.length === 0) return null;
  const correctedContent = normalizeText(
    raw.correctedContent,
    MAX_REVIEWED_MEMORY_CONTENT_LENGTH,
  );

  return {
    intent: raw.intent,
    category: raw.category as MemoryCategory,
    searchTerms,
    correctedContent: raw.intent === "CORRECT" ? correctedContent : null,
  };
}
