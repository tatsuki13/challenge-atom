import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMORY_RETRIEVAL_CONFIG,
  createContinuityFallbackRequest,
  createMemoryRetrievalAuditInput,
  discardSelectedMemoryResults,
  normalizeMemoryRetrievalRequest,
  normalizeMemorySearchText,
  searchActiveMemories,
  toMemoryPromptContext,
} from "../lib/ai/memoryRetrieval.ts";
import { validateMemoryRetrievalAudit } from "../lib/memoryRetrievalAuditRules.ts";

const baseMemory = {
  profileId: "profile-a", category: "preference", content: "朝は深煎りのコーヒーを飲むのが好き",
  normalizedKey: "深煎りコーヒー", polarity: "positive", temporalScope: "current", status: "active",
  supersedesId: null, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = {
  mode: "topic_match", categories: ["preference"], searchTerms: ["コーヒー"], polarities: [], temporalScopes: [],
  purpose: "飲み物の好みを会話に反映する", noSearchReason: "none", clarificationReason: "none",
};
const noRequest = {
  mode: "none", categories: [], searchTerms: [], polarities: [], temporalScopes: [], purpose: "",
  noSearchReason: "current_turn_sufficient", clarificationReason: "none",
};

function auditInput(overrides) {
  return createMemoryRetrievalAuditInput({
    profileId: "profile-a", requestSource: "openai_plan", plannedMode: "topic_match",
    status: "retrieved", failureReason: null, generationRejectionReason: null, ...overrides,
  });
}

test("NFKC normalization and Japanese partial matching remain deterministic", () => {
  assert.equal(normalizeMemorySearchText(" コーヒー！ "), "コーヒー");
  assert.equal(normalizeMemorySearchText("ＡＢＣ"), "abc");
  const evaluation = searchActiveMemories({ memories: [{ ...baseMemory, id: "memory-a" }], profileId: "profile-a", request });
  assert.equal(evaluation.results[0].memory.id, "memory-a");
  assert.ok(evaluation.results[0].score >= MEMORY_RETRIEVAL_CONFIG.minimumScore);
});

test("strict request validation requires coherent retrieval modes", () => {
  assert.deepEqual(normalizeMemoryRetrievalRequest(noRequest), noRequest);
  assert.deepEqual(normalizeMemoryRetrievalRequest(request), request);
  assert.equal(normalizeMemoryRetrievalRequest({ ...request, categories: [] }), null);
  assert.equal(normalizeMemoryRetrievalRequest({ ...request, noSearchReason: "greeting" }), null);
  assert.equal(normalizeMemoryRetrievalRequest({ ...noRequest, searchTerms: ["秘密"] }), null);
  assert.equal(normalizeMemoryRetrievalRequest({ ...noRequest, noSearchReason: "none" }), null);
  assert.deepEqual(
    normalizeMemoryRetrievalRequest({ ...request, searchTerms: ["青い帽子について"] })?.searchTerms,
    ["青い帽子"],
  );
  assert.deepEqual(normalizeMemoryRetrievalRequest({
    ...request, mode: "category_browse", searchTerms: [], purpose: "好みを一覧する",
  })?.mode, "category_browse");
  assert.deepEqual(normalizeMemoryRetrievalRequest({
    ...noRequest, mode: "clarification", noSearchReason: "none", purpose: "対象を確認する",
    clarificationReason: "category_and_topic_unknown",
  })?.mode, "clarification");
});

test("continuity fallback is limited to explicit prior-context expressions", () => {
  const fallback = createContinuityFallbackRequest("前に話した青い帽子のことを覚えていますか");
  assert.equal(fallback?.mode, "topic_match");
  assert.deepEqual(fallback?.categories, ["person", "place", "experience", "preference", "routine", "wish"]);
  assert.equal(createContinuityFallbackRequest("私の好みを覚えていますか")?.mode, "category_browse");
  assert.equal(createContinuityFallbackRequest("苦手だと言っていたものは？")?.mode, "category_browse");
  assert.equal(createContinuityFallbackRequest("将来したいことは何だった？")?.mode, "category_browse");
  assert.equal(createContinuityFallbackRequest("前に話したことを覚えていますか")?.mode, "clarification");
  assert.equal(createContinuityFallbackRequest("今日は青い帽子を買いました"), null);
  assert.equal(createContinuityFallbackRequest("富士山の高さは何メートルですか"), null);
  assert.equal(createContinuityFallbackRequest("こんにちは"), null);
});

test("polarity and temporal contradictions are excluded while explicit matches are preferred", () => {
  const memories = [
    { ...baseMemory, id: "current-positive", normalizedKey: "コーヒー", temporalScope: "current", polarity: "positive" },
    { ...baseMemory, id: "past-positive", normalizedKey: "コーヒー", temporalScope: "past", polarity: "positive" },
    { ...baseMemory, id: "current-negative", normalizedKey: "コーヒー", temporalScope: "current", polarity: "negative" },
  ];
  const evaluation = searchActiveMemories({
    memories, profileId: "profile-a",
    request: { ...request, polarities: ["positive"], temporalScopes: ["current"] },
  });
  assert.deepEqual(evaluation.results.map((item) => item.memory.id), ["current-positive"]);
  assert.equal(evaluation.candidates.find((item) => item.memory.id === "past-positive")?.disposition, "temporal_scope_mismatch");
  assert.equal(evaluation.candidates.find((item) => item.memory.id === "current-negative")?.disposition, "polarity_mismatch");
  assert.equal(evaluation.results[0].scoreBreakdown.polarityMatch, MEMORY_RETRIEVAL_CONFIG.scores.polarityMatch);
  assert.equal(evaluation.results[0].scoreBreakdown.temporalScopeMatch, MEMORY_RETRIEVAL_CONFIG.scores.temporalScopeMatch);
});

test("category browse is bounded, deterministic, and excludes contradictory or inactive memories", () => {
  const browseRequest = {
    ...request,
    mode: "category_browse",
    searchTerms: [],
    polarities: ["negative"],
    purpose: "苦手なことを確認する",
  };
  const memories = [
    { ...baseMemory, id: "older-negative", content: "辛い物が苦手", normalizedKey: "辛い物", polarity: "negative", updatedAt: new Date("2026-01-01") },
    { ...baseMemory, id: "newer-negative", content: "高い所が苦手", normalizedKey: "高い所", polarity: "negative", updatedAt: new Date("2026-02-01") },
    { ...baseMemory, id: "positive", content: "甘い物が好き", normalizedKey: "甘い物", polarity: "positive" },
    { ...baseMemory, id: "archived", content: "雷が苦手", normalizedKey: "雷", polarity: "negative", status: "archived" },
  ];
  const evaluation = searchActiveMemories({ memories, profileId: "profile-a", request: browseRequest });
  assert.deepEqual(evaluation.results.map((item) => item.memory.id), ["newer-negative", "older-negative"]);
  assert.equal(evaluation.candidates.find((item) => item.memory.id === "positive")?.disposition, "polarity_mismatch");
  assert.equal(evaluation.selectionRequired, false);
});

test("attribute constraints never create a match without text relevance", () => {
  const evaluation = searchActiveMemories({
    memories: [{ ...baseMemory, id: "unrelated", content: "犬が好き", normalizedKey: "犬" }],
    profileId: "profile-a", request: { ...request, polarities: ["positive"], temporalScopes: ["current"] },
  });
  assert.deepEqual(evaluation.results, []);
  assert.equal(evaluation.candidates[0].disposition, "no_text_match");
});

test("every active same-profile memory has a reproducible explanation", () => {
  const evaluation = searchActiveMemories({
    memories: [
      { ...baseMemory, id: "selected" },
      { ...baseMemory, id: "wrong-category", category: "routine" },
      { ...baseMemory, id: "archived", status: "archived" },
      { ...baseMemory, id: "foreign", profileId: "profile-b" },
    ], profileId: "profile-a", request,
  });
  assert.equal(evaluation.activeMemoryCount, 2);
  assert.equal(evaluation.candidates.length, 2);
  for (const { scoreBreakdown: score } of evaluation.candidates) {
    assert.equal(score.finalScore, score.categoryMatch + score.normalizedKeyExact + score.normalizedKeyPartial + score.contentPartial + score.bigramScore + score.polarityMatch + score.polarityMismatch + score.temporalScopeMatch + score.temporalScopeMismatch);
  }
});

test("result, character, and tie limits remain deterministic", () => {
  const tied = ["d", "b", "c", "a"].map((id) => ({ ...baseMemory, id }));
  const tieEvaluation = searchActiveMemories({ memories: tied, request, profileId: "profile-a" });
  assert.deepEqual(tieEvaluation.results.map((item) => item.memory.id), ["a", "b", "c"]);
  assert.equal(tieEvaluation.candidates.find((item) => item.memory.id === "d")?.disposition, "result_limit");
  const lengthEvaluation = searchActiveMemories({
    memories: [{ ...baseMemory, id: "too-long", content: `コーヒー${"あ".repeat(601)}` }, { ...baseMemory, id: "fits" }],
    request, profileId: "profile-a",
  });
  assert.deepEqual(lengthEvaluation.results.map((item) => item.memory.id), ["fits"]);
  assert.equal(lengthEvaluation.candidates.find((item) => item.memory.id === "too-long")?.disposition, "character_limit");
});

test("the prompt context omits the internal memory id", () => {
  const evaluation = searchActiveMemories({ memories: [{ ...baseMemory, id: "must-not-be-sent" }], profileId: "profile-a", request });
  const promptMemory = toMemoryPromptContext(evaluation.results[0]);
  assert.deepEqual(promptMemory, { category: "preference", content: baseMemory.content, polarity: "positive", temporalScope: "current" });
  assert.equal("id" in promptMemory, false);
});

test("audit links selected results to usage and records generation discard", () => {
  const evaluation = searchActiveMemories({ memories: [{ ...baseMemory, id: "selected" }], profileId: "profile-a", request });
  const audit = auditInput({ request, evaluation });
  assert.match(validateMemoryRetrievalAudit(audit, []) ?? "", /match memory usages/i);
  assert.equal(validateMemoryRetrievalAudit(audit, [{ memoryId: "selected", retrievalScore: evaluation.results[0].score, usageReason: request.purpose, usageRole: "answer_context" }]), null);
  const discardedAudit = auditInput({ request, evaluation: discardSelectedMemoryResults(evaluation) });
  assert.equal(discardedAudit.results[0].disposition, "generation_discarded");
  assert.equal(validateMemoryRetrievalAudit(discardedAudit, []), null);
  const rejectedAudit = auditInput({
    request,
    evaluation: discardSelectedMemoryResults(evaluation),
    generationRejectionReason: "too_many_questions",
  });
  assert.equal(validateMemoryRetrievalAudit(rejectedAudit, []), null);
  assert.match(
    validateMemoryRetrievalAudit(rejectedAudit, [{ memoryId: "selected", retrievalScore: evaluation.results[0].score, usageReason: request.purpose, usageRole: "answer_context" }]) ?? "",
    /must not create memory usages/i,
  );
});

test("audit distinguishes plan, fallback, no request, failure, and safety", () => {
  const evaluation = searchActiveMemories({ memories: [], profileId: "profile-a", request });
  const plan = auditInput({ request, evaluation, status: "no_match" });
  const fallback = auditInput({ request, evaluation, requestSource: "local_fallback", plannedMode: "none", status: "no_match" });
  const notRequested = auditInput({ request: noRequest, evaluation: null, requestSource: "none", plannedMode: "none", status: "not_requested" });
  const failed = auditInput({ request, evaluation: null, status: "failed", failureReason: "memory_read_failed" });
  const safety = auditInput({ request: null, evaluation: null, requestSource: "none", status: "skipped_safety" });
  assert.deepEqual([plan.requestSource, fallback.requestSource, notRequested.executed, failed.executed, safety.status], ["openai_plan", "local_fallback", false, true, "skipped_safety"]);
  for (const audit of [plan, fallback, notRequested, failed, safety]) assert.equal(validateMemoryRetrievalAudit(audit, []), null);
});
