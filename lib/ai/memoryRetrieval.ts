import type {
  MemoryCategory,
  MemoryPolarity,
  MemoryPromptContext,
  MemoryRetrievalClarificationReason,
  MemoryRetrievalAuditInput,
  MemoryRetrievalDisposition,
  MemoryRetrievalFailureReason,
  MemoryRetrievalMode,
  MemoryRetrievalNoSearchReason,
  MemoryRetrievalRequest,
  MemoryRetrievalScoreBreakdown,
  MemoryRetrievalSource,
  MemoryRetrievalStatus,
  MemorySearchCandidate,
  MemorySearchEvaluation,
  MemorySearchResult,
  MemoryTemporalScope,
  StoredMemory,
} from "../conversationTypes";

export const MEMORY_RETRIEVAL_CONFIG = {
  version: "phase9-local-v1",
  maxCategories: 6,
  maxSearchTerms: 5,
  maxSearchTermLength: 80,
  maxPurposeLength: 120,
  maxResults: 3,
  maxContextCharacters: 600,
  browseMaxResults: 3,
  browseMaxContextCharacters: 600,
  minimumScore: 7,
  attributeStrategy: "exclude" as const,
  scores: {
    categoryMatch: 2,
    normalizedKeyExact: 12,
    normalizedKeyPartial: 9,
    contentPartial: 7,
    bigramHigh: 6,
    bigramMedium: 5,
    polarityMatch: 3,
    polarityMismatch: -8,
    temporalScopeMatch: 3,
    temporalScopeMismatch: -8,
  },
  bigramRatios: { high: 0.75, medium: 0.5 },
} as const;

export type MemoryRetrievalConfig = {
  minimumScore: number;
  maxResults: number;
  maxContextCharacters: number;
  browseMaxResults: number;
  browseMaxContextCharacters: number;
  attributeStrategy: "ignore" | "exclude" | "score";
};

const memoryCategories = new Set<MemoryCategory>([
  "person", "place", "experience", "preference", "routine", "wish",
]);
const memoryPolarities = new Set<MemoryPolarity>(["positive", "negative", "neutral"]);
const memoryTemporalScopes = new Set<MemoryTemporalScope>([
  "past", "current", "future", "timeless", "unknown",
]);
const retrievalModes = new Set<MemoryRetrievalMode>([
  "none", "topic_match", "category_browse", "clarification",
]);
const noSearchReasons = new Set<MemoryRetrievalNoSearchReason>([
  "none", "general_knowledge", "greeting", "current_turn_sufficient",
  "memory_would_be_unnatural", "no_concrete_topic",
]);
const clarificationReasons = new Set<MemoryRetrievalClarificationReason>([
  "none", "category_and_topic_unknown", "ambiguous_prior_reference",
]);
const allMemoryCategories = [...memoryCategories];

export function toMemoryPromptContext(result: MemorySearchResult): MemoryPromptContext {
  return {
    category: result.memory.category,
    content: result.memory.content,
    polarity: result.memory.polarity,
    temporalScope: result.memory.temporalScope,
  };
}

export function normalizeMemorySearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s\p{P}\p{S}]+/gu, "").trim();
}

function normalizeComparableJapaneseText(value: string) {
  return normalizeMemorySearchText(value).replace(/[はがをにへのとも]/g, "");
}

function sanitizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeEnumArray<T extends string>(value: unknown, allowed: Set<T>) {
  return Array.isArray(value)
    ? value.filter(
        (item, index, values): item is T =>
          typeof item === "string" && allowed.has(item as T) && values.indexOf(item) === index,
      )
    : [];
}

export function normalizeMemoryRetrievalRequest(value: unknown): MemoryRetrievalRequest | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.mode !== "string" || !retrievalModes.has(raw.mode as MemoryRetrievalMode)) return null;
  const mode = raw.mode as MemoryRetrievalMode;
  const categories = normalizeEnumArray(raw.categories, memoryCategories).slice(0, MEMORY_RETRIEVAL_CONFIG.maxCategories);
  const polarities = normalizeEnumArray(raw.polarities, memoryPolarities);
  const temporalScopes = normalizeEnumArray(raw.temporalScopes, memoryTemporalScopes);
  const searchTerms = Array.isArray(raw.searchTerms)
    ? raw.searchTerms
        .map((term) => sanitizeString(term, MEMORY_RETRIEVAL_CONFIG.maxSearchTermLength))
        .filter((term): term is string => Boolean(term))
        .map((term) => term.replace(/(?:について|のこと|の話)$/u, "").trim())
        .filter(Boolean)
        .filter((term, index, values) => values.indexOf(term) === index)
        .slice(0, MEMORY_RETRIEVAL_CONFIG.maxSearchTerms)
    : [];
  const purpose = typeof raw.purpose === "string"
    ? raw.purpose.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MEMORY_RETRIEVAL_CONFIG.maxPurposeLength)
    : "";
  const noSearchReason = typeof raw.noSearchReason === "string" && noSearchReasons.has(raw.noSearchReason as MemoryRetrievalNoSearchReason)
    ? raw.noSearchReason as MemoryRetrievalNoSearchReason
    : null;
  const clarificationReason = typeof raw.clarificationReason === "string" && clarificationReasons.has(raw.clarificationReason as MemoryRetrievalClarificationReason)
    ? raw.clarificationReason as MemoryRetrievalClarificationReason
    : null;
  if (!noSearchReason || !clarificationReason) return null;
  if (mode === "none") {
    if (categories.length || searchTerms.length || polarities.length || temporalScopes.length || purpose || noSearchReason === "none" || clarificationReason !== "none") return null;
    return { mode, categories: [], searchTerms: [], polarities: [], temporalScopes: [], purpose: "", noSearchReason, clarificationReason: "none" };
  }
  if (mode === "clarification") {
    if (categories.length || searchTerms.length || polarities.length || temporalScopes.length || !purpose || noSearchReason !== "none" || clarificationReason === "none") return null;
    return { mode, categories: [], searchTerms: [], polarities: [], temporalScopes: [], purpose, noSearchReason: "none", clarificationReason };
  }
  if (categories.length === 0 || !purpose || noSearchReason !== "none" || clarificationReason !== "none") return null;
  if (mode === "topic_match" && searchTerms.length === 0) return null;
  if (mode === "category_browse" && searchTerms.length > 0) return null;
  return { mode, categories, searchTerms, polarities, temporalScopes, purpose, noSearchReason: "none", clarificationReason: "none" };
}

const continuityReferencePatterns = [
  /(?:前に|以前|この前|前回).{0,24}(?:話|言|伝え|聞|教え)/u,
  /(?:覚えて(?:い|る|ます|た)|覚えてる|記憶に(?:ある|残って))/u,
  /(?:言っていた|話していた).{0,20}(?:もの|こと|何)/u,
  /(?:好み|苦手|希望|したいこと|経験|習慣).{0,20}(?:何|どれ).*(?:だった|でした)/u,
  /いつもの/u,
  /(?:前は|以前は|昔は|過去).{0,30}(?:今|現在|最近).{0,16}(?:違|変わ|どう)/u,
];

function inferFallbackCategories(userMessage: string): MemoryCategory[] {
  if (/(?:好み|好き|嫌い|苦手)/u.test(userMessage)) return ["preference"];
  if (/(?:いつも|習慣|日課)/u.test(userMessage)) return ["routine"];
  if (/(?:希望|願い|やりたい|したい|してみたい)/u.test(userMessage)) return ["wish"];
  if (/(?:経験|思い出|行ったこと|訪れたこと)/u.test(userMessage)) return ["experience"];
  return allMemoryCategories;
}

function inferFallbackPolarity(userMessage: string): MemoryPolarity[] {
  return /(?:苦手|嫌い)/u.test(userMessage) ? ["negative"] : [];
}

function inferFallbackTemporalScope(userMessage: string): MemoryTemporalScope[] {
  return /(?:将来|これから|したい|希望)/u.test(userMessage) ? ["future"] : [];
}

function inferConcreteFallbackTerms(userMessage: string) {
  const match = /(?:前に|以前|この前|前回)?(?:話した|言った|伝えた)?(.{2,32}?)(?:について|のこと|を覚えて|って覚えて)/u.exec(userMessage);
  const term = match?.[1]?.replace(/^(?:私の|わたしの)/u, "").trim();
  if (!term || /^(?:こと|内容|話|お話|記憶|好み|希望|願い|経験|習慣|日課|人|場所)$/u.test(term)) return [];
  return [term];
}

export function createContinuityFallbackRequest(userMessage: string): MemoryRetrievalRequest | null {
  const normalized = sanitizeString(userMessage, MEMORY_RETRIEVAL_CONFIG.maxSearchTermLength);
  if (!normalized || !continuityReferencePatterns.some((pattern) => pattern.test(normalized))) return null;
  const categories = inferFallbackCategories(normalized);
  const concreteTerms = inferConcreteFallbackTerms(normalized);
  const categoryKnown = categories.length !== allMemoryCategories.length;
  const common = {
    polarities: inferFallbackPolarity(normalized),
    temporalScopes: inferFallbackTemporalScope(normalized),
    noSearchReason: "none" as const,
  };
  if (concreteTerms.length > 0) return {
    mode: "topic_match", categories, searchTerms: concreteTerms,
    purpose: "continue_with_explicit_prior_context", clarificationReason: "none", ...common,
  };
  if (categoryKnown && /(?:覚えて|記憶|前に|以前|この前|前回|だった|でした|言っていた|話していた)/u.test(normalized)) return {
    mode: "category_browse", categories, searchTerms: [],
    purpose: "browse_explicit_memory_category", clarificationReason: "none", ...common,
  };
  return {
    mode: "clarification", categories: [], searchTerms: [], polarities: [], temporalScopes: [],
    purpose: "clarify_ambiguous_memory_reference", noSearchReason: "none",
    clarificationReason: "category_and_topic_unknown",
  };
}

function bigrams(value: string) {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
}

function bigramSimilarity(term: string, target: string) {
  if (term.length < 3 || target.length < 3) return 0;
  const left = bigrams(term);
  const right = bigrams(target);
  return [...left].filter((item) => right.has(item)).length / Math.max(left.size, 1);
}

function scoreText(memory: StoredMemory, terms: string[]) {
  const key = normalizeComparableJapaneseText(memory.normalizedKey);
  const content = normalizeComparableJapaneseText(memory.content);
  let best = {
    normalizedKeyExact: 0,
    normalizedKeyPartial: 0,
    contentPartial: 0,
    bigramSimilarity: 0,
    bigramScore: 0,
    bestTextScore: 0,
  };
  for (const rawTerm of terms) {
    const term = normalizeComparableJapaneseText(rawTerm);
    if (term.length < 2) continue;
    const candidate = { ...best, normalizedKeyExact: 0, normalizedKeyPartial: 0, contentPartial: 0, bigramSimilarity: 0, bigramScore: 0 };
    let textScore = 0;
    if (term === key) {
      textScore = MEMORY_RETRIEVAL_CONFIG.scores.normalizedKeyExact;
      candidate.normalizedKeyExact = textScore;
    } else if (key.includes(term) || term.includes(key)) {
      textScore = MEMORY_RETRIEVAL_CONFIG.scores.normalizedKeyPartial;
      candidate.normalizedKeyPartial = textScore;
    } else if (content.includes(term)) {
      textScore = MEMORY_RETRIEVAL_CONFIG.scores.contentPartial;
      candidate.contentPartial = textScore;
    } else {
      const similarity = Math.max(bigramSimilarity(term, key), bigramSimilarity(term, content));
      const score = similarity >= MEMORY_RETRIEVAL_CONFIG.bigramRatios.high
        ? MEMORY_RETRIEVAL_CONFIG.scores.bigramHigh
        : similarity >= MEMORY_RETRIEVAL_CONFIG.bigramRatios.medium
          ? MEMORY_RETRIEVAL_CONFIG.scores.bigramMedium
          : 0;
      textScore = score;
      candidate.bigramSimilarity = similarity;
      candidate.bigramScore = score;
    }
    if (textScore > best.bestTextScore) best = { ...candidate, bestTextScore: textScore };
  }
  return best;
}

function isPolarityContradiction(memory: MemoryPolarity, requested: MemoryPolarity[]) {
  return (memory === "positive" && requested.includes("negative")) ||
    (memory === "negative" && requested.includes("positive"));
}

function isTemporalScopeContradiction(memory: MemoryTemporalScope, requested: MemoryTemporalScope[]) {
  const explicit = new Set<MemoryTemporalScope>(["past", "current", "future"]);
  return explicit.has(memory) && requested.some((scope) => explicit.has(scope)) && !requested.includes(memory);
}

function scoreAttributes(memory: StoredMemory, request: MemoryRetrievalRequest, strategy: MemoryRetrievalConfig["attributeStrategy"]) {
  if (strategy === "ignore") {
    return { polarityMatch: 0, polarityMismatch: 0, temporalScopeMatch: 0, temporalScopeMismatch: 0, polarityContradiction: false, temporalContradiction: false };
  }
  const polarityMatch = request.polarities.includes(memory.polarity) ? MEMORY_RETRIEVAL_CONFIG.scores.polarityMatch : 0;
  const polarityContradiction = request.polarities.length > 0 && isPolarityContradiction(memory.polarity, request.polarities);
  const temporalScopeMatch = request.temporalScopes.includes(memory.temporalScope) ? MEMORY_RETRIEVAL_CONFIG.scores.temporalScopeMatch : 0;
  const temporalContradiction = request.temporalScopes.length > 0 && isTemporalScopeContradiction(memory.temporalScope, request.temporalScopes);
  return {
    polarityMatch,
    polarityMismatch: strategy === "score" && polarityContradiction ? MEMORY_RETRIEVAL_CONFIG.scores.polarityMismatch : 0,
    temporalScopeMatch,
    temporalScopeMismatch: strategy === "score" && temporalContradiction ? MEMORY_RETRIEVAL_CONFIG.scores.temporalScopeMismatch : 0,
    polarityContradiction,
    temporalContradiction,
  };
}

export function searchActiveMemories({ memories, request, profileId, config = MEMORY_RETRIEVAL_CONFIG }: {
  memories: StoredMemory[];
  request: MemoryRetrievalRequest;
  profileId: string;
  config?: MemoryRetrievalConfig;
}): MemorySearchEvaluation {
  const activeMemories = memories.filter((memory) => memory.profileId === profileId && memory.status === "active");
  if (request.mode === "none" || request.mode === "clarification") return { activeMemoryCount: activeMemories.length, thresholdPassedCount: 0, results: [], candidates: [], selectionRequired: false };
  const categorySet = new Set(request.categories);
  const categoryBrowse = request.mode === "category_browse";
  const evaluated = activeMemories.map((memory) => {
    const categoryMatched = categorySet.has(memory.category);
    const text = categoryMatched && !categoryBrowse ? scoreText(memory, request.searchTerms) : {
      normalizedKeyExact: 0, normalizedKeyPartial: 0, contentPartial: 0,
      bigramSimilarity: 0, bigramScore: 0, bestTextScore: 0,
    };
    const attributes = scoreAttributes(memory, request, categoryMatched ? config.attributeStrategy : "ignore");
    const categoryMatch = categoryMatched && (categoryBrowse || text.bestTextScore > 0) ? MEMORY_RETRIEVAL_CONFIG.scores.categoryMatch : 0;
    const scoreBreakdown: MemoryRetrievalScoreBreakdown = {
      categoryMatch,
      normalizedKeyExact: text.normalizedKeyExact,
      normalizedKeyPartial: text.normalizedKeyPartial,
      contentPartial: text.contentPartial,
      bigramSimilarity: text.bigramSimilarity,
      bigramScore: text.bigramScore,
      polarityMatch: attributes.polarityMatch,
      polarityMismatch: attributes.polarityMismatch,
      temporalScopeMatch: attributes.temporalScopeMatch,
      temporalScopeMismatch: attributes.temporalScopeMismatch,
      finalScore: text.bestTextScore + categoryMatch + attributes.polarityMatch + attributes.polarityMismatch + attributes.temporalScopeMatch + attributes.temporalScopeMismatch,
    };
    const disposition: MemoryRetrievalDisposition = !categoryMatched
      ? "category_mismatch"
        : !categoryBrowse && text.bestTextScore === 0
        ? "no_text_match"
        : config.attributeStrategy === "exclude" && attributes.polarityContradiction
          ? "polarity_mismatch"
          : config.attributeStrategy === "exclude" && attributes.temporalContradiction
            ? "temporal_scope_mismatch"
            : !categoryBrowse && scoreBreakdown.finalScore < config.minimumScore
              ? "below_threshold"
              : "selected";
    return {
      memory: { id: memory.id, category: memory.category, content: memory.content, polarity: memory.polarity, temporalScope: memory.temporalScope },
      scoreBreakdown,
      disposition: disposition as MemoryRetrievalDisposition,
      normalizedKey: normalizeMemorySearchText(memory.normalizedKey),
      updatedAt: memory.updatedAt.getTime(),
    };
  });
  const thresholdPassed = evaluated
    .filter((item) => item.disposition === "selected")
    .sort((left, right) =>
      right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore ||
      (categoryBrowse ? right.updatedAt - left.updatedAt : 0) ||
      left.normalizedKey.localeCompare(right.normalizedKey, "ja") ||
      left.memory.id.localeCompare(right.memory.id));
  const selectedIds = new Set<string>();
  let characterCount = 0;
  const maxResults = categoryBrowse ? config.browseMaxResults : config.maxResults;
  const maxCharacters = categoryBrowse ? config.browseMaxContextCharacters : config.maxContextCharacters;
  for (const item of thresholdPassed) {
    if (selectedIds.size >= maxResults) item.disposition = "result_limit";
    else if (characterCount + item.memory.content.length > maxCharacters) item.disposition = "character_limit";
    else {
      characterCount += item.memory.content.length;
      selectedIds.add(item.memory.id);
    }
  }
  const candidates: MemorySearchCandidate[] = evaluated.map(({ memory, scoreBreakdown, disposition }) => ({ memory, scoreBreakdown, disposition }));
  const results = thresholdPassed
    .filter((item) => selectedIds.has(item.memory.id))
    .map((item) => ({ memory: item.memory, score: item.scoreBreakdown.finalScore, reason: request.purpose, scoreBreakdown: item.scoreBreakdown }));
  return { activeMemoryCount: activeMemories.length, thresholdPassedCount: thresholdPassed.length, results, candidates, selectionRequired: categoryBrowse && thresholdPassed.length > maxResults };
}

export function discardSelectedMemoryResults(evaluation: MemorySearchEvaluation | null): MemorySearchEvaluation | null {
  if (!evaluation) return null;
  return {
    ...evaluation,
    results: [],
    selectionRequired: evaluation.selectionRequired,
    candidates: evaluation.candidates.map((candidate) =>
      candidate.disposition === "selected" ? { ...candidate, disposition: "generation_discarded" } : candidate),
  };
}

export function createMemoryRetrievalAuditInput({
  profileId, request, requestSource, plannedMode, evaluation, status, failureReason, generationRejectionReason,
}: {
  profileId: string;
  request: MemoryRetrievalRequest | null;
  requestSource: MemoryRetrievalSource;
  plannedMode: MemoryRetrievalMode;
  evaluation: MemorySearchEvaluation | null;
  status: MemoryRetrievalStatus;
  failureReason: MemoryRetrievalFailureReason | null;
  generationRejectionReason: MemoryRetrievalAuditInput["generationRejectionReason"];
}): MemoryRetrievalAuditInput {
  return {
    profileId,
    executed: evaluation !== null || (status === "failed" && failureReason === "memory_read_failed"),
    status,
    requestSource,
    plannedMode,
    finalMode: request?.mode ?? "none",
    noSearchReason: request?.noSearchReason ?? "none",
    clarificationReason: request?.clarificationReason ?? "none",
    categories: request && (request.mode === "topic_match" || request.mode === "category_browse") ? request.categories : [],
    polarities: request && (request.mode === "topic_match" || request.mode === "category_browse") ? request.polarities : [],
    temporalScopes: request && (request.mode === "topic_match" || request.mode === "category_browse") ? request.temporalScopes : [],
    activeMemoryCount: evaluation?.activeMemoryCount ?? 0,
    thresholdPassedCount: evaluation?.thresholdPassedCount ?? 0,
    selectedCount: evaluation?.results.length ?? 0,
    failureReason,
    generationRejectionReason,
    configVersion: MEMORY_RETRIEVAL_CONFIG.version,
    minimumScore: MEMORY_RETRIEVAL_CONFIG.minimumScore,
    maxResults: request?.mode === "category_browse" ? MEMORY_RETRIEVAL_CONFIG.browseMaxResults : MEMORY_RETRIEVAL_CONFIG.maxResults,
    maxContextCharacters: request?.mode === "category_browse" ? MEMORY_RETRIEVAL_CONFIG.browseMaxContextCharacters : MEMORY_RETRIEVAL_CONFIG.maxContextCharacters,
    attributeStrategy: MEMORY_RETRIEVAL_CONFIG.attributeStrategy,
    results: evaluation?.candidates.map((candidate) => ({
      memoryId: candidate.memory.id,
      scoreBreakdown: candidate.scoreBreakdown,
      disposition: candidate.disposition,
    })) ?? [],
  };
}
