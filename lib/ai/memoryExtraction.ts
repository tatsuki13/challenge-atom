import type {
  ExtractedMemoryCandidate,
  MemoryAssertion,
  MemoryCategory,
  MemoryExtractionResult,
  MemoryPolarity,
  MemoryRejectionReasonCode,
  MemorySubject,
  MemoryTemporalScope,
} from "../conversationTypes";

export const MEMORY_EXTRACTION_VERSION = "memory-candidate-v1";
export const MAX_MEMORY_CANDIDATES_PER_TURN = 5;
export const MIN_MEMORY_CONFIDENCE = 0.75;

const memoryCategories = new Set<MemoryCategory>([
  "person",
  "place",
  "experience",
  "preference",
  "routine",
  "wish",
]);
const memorySubjects = new Set<MemorySubject>(["user", "other", "unknown"]);
const memoryAssertions = new Set<MemoryAssertion>([
  "affirmed",
  "uncertain",
  "hypothetical",
  "quoted",
]);
const memoryPolarities = new Set<MemoryPolarity>([
  "positive",
  "negative",
  "neutral",
]);
const memoryTemporalScopes = new Set<MemoryTemporalScope>([
  "past",
  "current",
  "future",
  "timeless",
  "unknown",
]);

const meaninglessReplyPattern =
  /^(?:分かりません|わかりません|分からない|わからない|特にない(?:です)?|別に(?:ない)?|ないです|ありません)[。.!！?？]*$/;
const thirdPartySubjectPattern =
  /^(?:娘|息子|夫|妻|配偶者|母|父|祖母|祖父|孫|兄|姉|弟|妹|友人|知人|先生|先輩|後輩|同僚|俳優|芸能人)(?:は|が)/;
const firstPersonPattern = /(?:私は|わたしは|僕は|俺は|自分は|私が|わたしが|僕が|俺が|自分が)/;
const quotedMediaPattern =
  /(?:テレビ|ニュース|新聞|ラジオ).*(?:言って|話して|報じ|見た|見ました|聞いた|聞きました)/;
const explicitWishPattern =
  /(?:たい|たらいい|たら良い|できれば|出来れば|続けたい|行けたら|会えたら|見られたら)/;
const genericEvidenceCharacters = new Set("行見思好私自分来出来希望");
const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?\d[\d\s()-]{8,}\d)/,
  /(?:\d[ -]?){12,19}/,
  /(?:パスワード|暗証番号|口座番号|クレジットカード|マイナンバー)/,
  /(?:都|道|府|県).{0,40}(?:市|区|町|村).{0,40}\d/,
];

export const MEMORY_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["person", "place", "experience", "preference", "routine", "wish"],
    },
    content: { type: "string", minLength: 1, maxLength: 240 },
    normalizedKey: { type: "string", minLength: 1, maxLength: 120 },
    subject: { type: "string", enum: ["user", "other", "unknown"] },
    assertion: {
      type: "string",
      enum: ["affirmed", "uncertain", "hypothetical", "quoted"],
    },
    polarity: { type: "string", enum: ["positive", "negative", "neutral"] },
    temporalScope: {
      type: "string",
      enum: ["past", "current", "future", "timeless", "unknown"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "category",
    "content",
    "normalizedKey",
    "subject",
    "assertion",
    "polarity",
    "temporalScope",
    "confidence",
  ],
} as const;

function compactText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const compacted = value.replace(/\s+/g, " ").trim();

  return compacted.length > 0 && compacted.length <= maxLength
    ? compacted
    : null;
}

function isSensitive(text: string) {
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

function normalizeForEvidence(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/(?:ユーザー|利用者|ご本人|本人|わたし|私|僕|自分)/g, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function hasCurrentUtteranceEvidence(
  candidate: ExtractedMemoryCandidate,
  currentUtterance: string,
) {
  const source = normalizeForEvidence(currentUtterance);
  const key = normalizeForEvidence(candidate.normalizedKey);
  const content = normalizeForEvidence(candidate.content);

  if (source.length < 2) {
    return false;
  }

  for (const candidateText of [key, content]) {
    const evidenceSize = 2;

    for (let index = 0; index <= candidateText.length - evidenceSize; index += 1) {
      if (source.includes(candidateText.slice(index, index + evidenceSize))) {
        return true;
      }
    }
  }

  if (candidate.category === "wish" && explicitWishPattern.test(currentUtterance)) {
    const sourceCharacters = new Set(
      (source.match(/[\p{Script=Han}\p{Script=Katakana}]/gu) ?? []).filter(
        (character) => !genericEvidenceCharacters.has(character),
      ),
    );
    const candidateCharacters = [key, content]
      .flatMap((text) => text.match(/[\p{Script=Han}\p{Script=Katakana}]/gu) ?? [])
      .filter((character) => !genericEvidenceCharacters.has(character));

    return candidateCharacters.some((character) => sourceCharacters.has(character));
  }

  return false;
}

function categoryMatchesMetadata(candidate: ExtractedMemoryCandidate) {
  switch (candidate.category) {
    case "experience":
      return candidate.temporalScope === "past" || candidate.temporalScope === "current";
    case "preference":
      return (
        candidate.temporalScope === "current" ||
        candidate.temporalScope === "timeless" ||
        candidate.temporalScope === "unknown"
      );
    case "routine":
      return candidate.temporalScope === "current" || candidate.temporalScope === "timeless";
    case "wish":
      return (
        candidate.temporalScope === "future" ||
        candidate.temporalScope === "current" ||
        candidate.temporalScope === "unknown"
      );
    default:
      return true;
  }
}

function validateShape(value: unknown):
  | { candidate: ExtractedMemoryCandidate }
  | { reason: MemoryRejectionReasonCode } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { reason: "invalid_shape" };
  }

  const raw = value as Record<string, unknown>;
  if (typeof raw.category !== "string" || !memoryCategories.has(raw.category as MemoryCategory)) {
    return { reason: "invalid_category" };
  }

  const content = compactText(raw.content, 240);
  if (!content) {
    return { reason: "invalid_content" };
  }

  const normalizedKey = compactText(raw.normalizedKey, 120);
  if (!normalizedKey) {
    return { reason: "invalid_normalized_key" };
  }

  if (typeof raw.subject !== "string" || !memorySubjects.has(raw.subject as MemorySubject)) {
    return { reason: "invalid_subject" };
  }

  if (
    typeof raw.assertion !== "string" ||
    !memoryAssertions.has(raw.assertion as MemoryAssertion)
  ) {
    return { reason: "invalid_assertion" };
  }

  if (typeof raw.polarity !== "string" || !memoryPolarities.has(raw.polarity as MemoryPolarity)) {
    return { reason: "invalid_polarity" };
  }

  if (
    typeof raw.temporalScope !== "string" ||
    !memoryTemporalScopes.has(raw.temporalScope as MemoryTemporalScope)
  ) {
    return { reason: "invalid_temporal_scope" };
  }

  if (
    typeof raw.confidence !== "number" ||
    !Number.isFinite(raw.confidence) ||
    raw.confidence < 0 ||
    raw.confidence > 1
  ) {
    return { reason: "invalid_confidence" };
  }

  return {
    candidate: {
      category: raw.category as MemoryCategory,
      content,
      normalizedKey,
      subject: raw.subject as MemorySubject,
      assertion: raw.assertion as MemoryAssertion,
      polarity: raw.polarity as MemoryPolarity,
      temporalScope: raw.temporalScope as MemoryTemporalScope,
      confidence: raw.confidence,
    },
  };
}

export function validateMemoryCandidates({
  rawCandidates,
  currentUtterance,
}: {
  rawCandidates: unknown;
  currentUtterance: string;
}) {
  const accepted: ExtractedMemoryCandidate[] = [];
  const reasons: MemoryRejectionReasonCode[] = [];
  const values = Array.isArray(rawCandidates) ? rawCandidates : [];

  if (!Array.isArray(rawCandidates)) {
    reasons.push("invalid_shape");
  }

  if (values.length > MAX_MEMORY_CANDIDATES_PER_TURN) {
    reasons.push(
      ...Array.from(
        { length: values.length - MAX_MEMORY_CANDIDATES_PER_TURN },
        () => "too_many_candidates" as const,
      ),
    );
  }

  const currentText = currentUtterance.replace(/\s+/g, " ").trim();
  const sourceHasNoMeaning = currentText.length < 4 || meaninglessReplyPattern.test(currentText);
  const sourceIsSensitive = isSensitive(currentText);
  const sourceIsThirdPartyStatement =
    thirdPartySubjectPattern.test(currentText) && !firstPersonPattern.test(currentText);
  const sourceIsQuotedMedia = quotedMediaPattern.test(currentText);
  const dedupeKeys = new Set<string>();

  if (values.length === 0 && sourceHasNoMeaning) {
    reasons.push("empty_meaning");
  }

  if (values.length === 0 && sourceIsSensitive) {
    reasons.push("sensitive_content");
  }

  for (const rawCandidate of values.slice(0, MAX_MEMORY_CANDIDATES_PER_TURN)) {
    const result = validateShape(rawCandidate);

    if ("reason" in result) {
      reasons.push(result.reason);
      continue;
    }

    const candidate = result.candidate;
    if (sourceHasNoMeaning) {
      reasons.push("empty_meaning");
      continue;
    }

    if (sourceIsSensitive || isSensitive(candidate.content) || isSensitive(candidate.normalizedKey)) {
      reasons.push("sensitive_content");
      continue;
    }

    if (sourceIsThirdPartyStatement) {
      reasons.push("unsupported_subject");
      continue;
    }

    if (sourceIsQuotedMedia) {
      reasons.push("unsupported_assertion");
      continue;
    }

    if (candidate.subject !== "user") {
      reasons.push("unsupported_subject");
      continue;
    }

    const assertionAllowed =
      candidate.assertion === "affirmed" ||
      (candidate.category === "wish" && candidate.assertion === "hypothetical");
    if (!assertionAllowed) {
      reasons.push("unsupported_assertion");
      continue;
    }

    if (candidate.confidence < MIN_MEMORY_CONFIDENCE) {
      reasons.push("low_confidence");
      continue;
    }

    if (!categoryMatchesMetadata(candidate)) {
      reasons.push("category_mismatch");
      continue;
    }

    if (!hasCurrentUtteranceEvidence(candidate, currentText)) {
      reasons.push("no_current_utterance_evidence");
      continue;
    }

    const dedupeKey = `${candidate.category}:${normalizeForEvidence(candidate.normalizedKey)}`;
    if (dedupeKeys.has(dedupeKey)) {
      reasons.push("invalid_shape");
      continue;
    }

    dedupeKeys.add(dedupeKey);
    accepted.push(candidate);
  }

  return {
    candidates: accepted,
    rejectedCount: reasons.length,
    rejectionReasonCodes: [...new Set(reasons)],
  };
}

export function createMemoryExtractionResult(
  status: MemoryExtractionResult["status"],
  overrides: Partial<Omit<MemoryExtractionResult, "status">> = {},
): MemoryExtractionResult {
  return {
    status,
    candidateCount: 0,
    candidateIds: [],
    categories: [],
    rejectedCount: 0,
    rejectionReasonCodes: [],
    ...overrides,
  };
}
