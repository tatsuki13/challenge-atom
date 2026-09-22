import assert from "node:assert/strict";
import test from "node:test";
import { MEMORY_RETRIEVAL_CONFIG, searchActiveMemories } from "../lib/ai/memoryRetrieval.ts";
import { compareMemoryRetrievalSettings, evaluateMemoryRetrieval } from "../scripts/evaluateMemoryRetrieval.mjs";
import { memoryRetrievalEvaluationCases } from "./fixtures/memoryRetrievalEvaluation.mjs";

const requiredTags = [
  "exact", "notation-variation", "japanese-paraphrase", "bigram-boundary", "short-term", "category-mismatch",
  "polarity", "temporal-scope", "similar-unrelated", "multiple", "superseded", "archived",
  "profile", "no-answer", "result-limit", "character-limit", "tie", "instruction-content",
  "prior-reference", "positive-negative", "past-current-change", "future-vs-routine",
  "fallback", "unknown-category", "fallback-no-answer", "general-question", "greeting",
  "unnecessary-similar", "same-content-temporal",
  "mode-category-browse", "mode-clarification", "browse-zero", "browse-one", "browse-many",
  "browse-negative", "browse-future", "browse-scope", "no-unnecessary-browse", "unknown-category-no-use",
];

test("the synthetic evaluation set covers all required retrieval risks", () => {
  const tags = new Set(memoryRetrievalEvaluationCases.flatMap((item) => item.tags));
  for (const tag of requiredTags) assert.ok(tags.has(tag), `missing fixture tag: ${tag}`);
  for (const item of memoryRetrievalEvaluationCases) {
    assert.ok(item.name && item.currentUtterance);
    assert.ok(item.memories.every((memory) => ["evaluation-profile", "other-profile"].includes(memory.profileId)));
    assert.ok(item.expectedIds.every((id) => !item.forbiddenIds.includes(id)));
  }
});

test("offline evaluation calculates every required metric", () => {
  const report = evaluateMemoryRetrieval({ config: MEMORY_RETRIEVAL_CONFIG, fallbackEnabled: true });
  assert.equal(report.caseCount, memoryRetrievalEvaluationCases.length);
  assert.equal(report.config.minimumScore, MEMORY_RETRIEVAL_CONFIG.minimumScore);
  for (const key of ["precision", "recall", "f1", "precisionAtK", "recallAtK", "meanReciprocalRank", "noAnswerFalseAcceptanceRate", "modeClassificationAccuracy", "categoryBrowseCandidatePrecision", "clarificationAccuracy", "unnecessaryCategoryBrowseRate"]) {
    assert.ok(report.metrics[key] >= 0 && report.metrics[key] <= 1, `${key} must be a ratio`);
  }
  assert.ok(Number.isInteger(report.metrics.falsePositiveCount));
  assert.ok(Number.isInteger(report.metrics.missedCount));
});

test("attribute and fallback comparisons do not mutate production settings", () => {
  const reports = compareMemoryRetrievalSettings();
  assert.deepEqual(reports.map((item) => item.name), [
    "phase7-ignore-no-fallback", "exclude-no-fallback", "score-no-fallback", "production-exclude-with-fallback",
  ]);
  assert.equal(MEMORY_RETRIEVAL_CONFIG.minimumScore, 7);
  assert.equal(MEMORY_RETRIEVAL_CONFIG.maxResults, 3);
  assert.equal(MEMORY_RETRIEVAL_CONFIG.browseMaxResults, 3);
  assert.equal(MEMORY_RETRIEVAL_CONFIG.attributeStrategy, "exclude");
});

test("the evaluator and production path share deterministic limit and tie behavior", () => {
  const tieCase = memoryRetrievalEvaluationCases.find((item) => item.name === "deterministic-tie");
  const result = searchActiveMemories({
    memories: tieCase.memories,
    profileId: "evaluation-profile",
    request: tieCase.request,
    config: MEMORY_RETRIEVAL_CONFIG,
  });
  assert.deepEqual(result.results.map((item) => item.memory.id), tieCase.expectedIds);
  assert.equal(result.candidates.find((item) => item.memory.id === "tie-d")?.disposition, "result_limit");
});
