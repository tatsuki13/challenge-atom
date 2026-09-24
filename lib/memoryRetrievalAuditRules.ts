import type {
  MemoryRetrievalAuditInput,
  MemoryRetrievalDisposition,
  MemoryUsageInput,
} from "./conversationTypes";

const dispositions = new Set<MemoryRetrievalDisposition>([
  "selected",
  "category_mismatch",
  "polarity_mismatch",
  "temporal_scope_mismatch",
  "no_text_match",
  "below_threshold",
  "result_limit",
  "character_limit",
  "generation_discarded",
]);

function sameIds(left: string[], right: string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((id, index) => id === sortedRight[index]);
}

export function validateMemoryRetrievalAudit(
  audit: MemoryRetrievalAuditInput,
  usages: MemoryUsageInput[],
) {
  if (
    !audit.profileId ||
    !audit.configVersion ||
    audit.activeMemoryCount < 0 ||
    audit.thresholdPassedCount < 0 ||
    audit.selectedCount < 0 ||
    audit.minimumScore < 0 ||
    audit.maxResults < 1 ||
    audit.maxContextCharacters < 1 ||
    !["openai_plan", "local_fallback", "none"].includes(audit.requestSource) ||
    !["none", "topic_match", "category_browse", "clarification"].includes(audit.plannedMode) ||
    !["none", "topic_match", "category_browse", "clarification"].includes(audit.finalMode) ||
    !["none", "general_knowledge", "greeting", "current_turn_sufficient", "memory_would_be_unnatural", "no_concrete_topic"].includes(audit.noSearchReason) ||
    !["none", "category_and_topic_unknown", "ambiguous_prior_reference"].includes(audit.clarificationReason) ||
    (audit.generationRejectionReason !== null && !["too_many_questions", "missing_continuation_cue", "missing_clarification", "unsupported_memory_claim", "mode_contract_violation", "empty_response", "generation_error"].includes(audit.generationRejectionReason)) ||
    !["ignore", "exclude", "score"].includes(audit.attributeStrategy)
  ) {
    return "Memory retrieval audit summary is invalid.";
  }
  if (audit.finalMode === "clarification" && usages.length > 0) {
    return "Clarification must not create memory usages.";
  }
  if (audit.generationRejectionReason !== null && usages.length > 0) {
    return "A rejected generated reply must not create memory usages.";
  }
  const resultIds = audit.results.map((result) => result.memoryId);
  if (new Set(resultIds).size !== resultIds.length) {
    return "Memory retrieval audit results must be unique.";
  }
  if (audit.executed && audit.status !== "failed" && audit.activeMemoryCount !== audit.results.length) {
    return "A successful retrieval audit must explain every active memory.";
  }
  if (!audit.executed && audit.results.length > 0) {
    return "A retrieval that was not executed must not contain results.";
  }
  if (audit.executed && audit.requestSource === "none") {
    return "An executed memory retrieval must record its source.";
  }
  const thresholdPassed = audit.results.filter((result) =>
    ["selected", "result_limit", "character_limit", "generation_discarded"].includes(result.disposition),
  );
  if (thresholdPassed.length !== audit.thresholdPassedCount) {
    return "Threshold-passing retrieval results must match the audit summary.";
  }
  const selected = audit.results.filter((result) => result.disposition === "selected");
  if (selected.length !== audit.selectedCount || selected.length !== usages.length) {
    return "Selected retrieval audit results must match memory usages.";
  }
  if (!sameIds(selected.map((result) => result.memoryId), usages.map((usage) => usage.memoryId))) {
    return "Selected retrieval audit memory IDs must match memory usages.";
  }
  for (const result of audit.results) {
    const breakdown = result.scoreBreakdown;
    const expected =
      breakdown.categoryMatch +
      breakdown.normalizedKeyExact +
      breakdown.normalizedKeyPartial +
      breakdown.contentPartial +
      breakdown.bigramScore +
      breakdown.polarityMatch +
      breakdown.polarityMismatch +
      breakdown.temporalScopeMatch +
      breakdown.temporalScopeMismatch;
    if (
      !dispositions.has(result.disposition) ||
      ![
        breakdown.categoryMatch, breakdown.normalizedKeyExact, breakdown.normalizedKeyPartial,
        breakdown.contentPartial, breakdown.bigramSimilarity, breakdown.bigramScore,
        breakdown.polarityMatch, breakdown.polarityMismatch,
        breakdown.temporalScopeMatch, breakdown.temporalScopeMismatch, breakdown.finalScore,
      ].every(Number.isFinite) ||
      !Number.isFinite(breakdown.bigramSimilarity) ||
      breakdown.bigramSimilarity < 0 ||
      breakdown.bigramSimilarity > 1 ||
      Math.abs(expected - breakdown.finalScore) > 1e-9
    ) {
      return "Memory retrieval score breakdown is invalid.";
    }
    const usage = usages.find((item) => item.memoryId === result.memoryId);
    if (usage && Math.abs(usage.retrievalScore - breakdown.finalScore) > 1e-9) {
      return "Memory usage score must match the retrieval audit.";
    }
    if (usage && !["answer_context", "candidate_presentation"].includes(usage.usageRole)) {
      return "Memory usage role is invalid.";
    }
  }
  return null;
}
