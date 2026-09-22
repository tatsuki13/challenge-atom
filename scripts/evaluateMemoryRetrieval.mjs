import { pathToFileURL } from "node:url";
import {
  MEMORY_RETRIEVAL_CONFIG,
  createContinuityFallbackRequest,
  searchActiveMemories,
} from "../lib/ai/memoryRetrieval.ts";
import { memoryRetrievalEvaluationCases } from "../tests/fixtures/memoryRetrievalEvaluation.mjs";

function divide(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value) {
  return Number(value.toFixed(4));
}

export function evaluateMemoryRetrieval({ config = MEMORY_RETRIEVAL_CONFIG, fallbackEnabled = true } = {}) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let reciprocalRankTotal = 0;
  let answerCaseCount = 0;
  let noAnswerCaseCount = 0;
  let noAnswerFalseAcceptanceCount = 0;
  let modeCaseCount = 0;
  let modeCorrectCount = 0;
  let browseTruePositives = 0;
  let browseFalsePositives = 0;
  let clarificationCaseCount = 0;
  let clarificationCorrectCount = 0;
  let nonBrowseCaseCount = 0;
  let unnecessaryBrowseCount = 0;
  let unknownCategoryWrongUsageCount = 0;

  for (const evaluationCase of memoryRetrievalEvaluationCases) {
    const request = evaluationCase.request.mode !== "none" || !fallbackEnabled
      ? evaluationCase.request
      : createContinuityFallbackRequest(evaluationCase.currentUtterance) ?? evaluationCase.request;
    const result = searchActiveMemories({
      memories: evaluationCase.memories,
      profileId: "evaluation-profile",
      request,
      config,
    });
    const selectedIds = result.results.map((item) => item.memory.id);
    const expectedIds = new Set(evaluationCase.expectedIds);
    const caseTruePositives = selectedIds.filter((id) => expectedIds.has(id)).length;
    if (request.mode === "topic_match") {
      truePositives += caseTruePositives;
      falsePositives += selectedIds.length - caseTruePositives;
      falseNegatives += evaluationCase.expectedIds.length - caseTruePositives;
      if (evaluationCase.expectedIds.length === 0) {
        noAnswerCaseCount += 1;
        if (selectedIds.length > 0) noAnswerFalseAcceptanceCount += 1;
      } else {
        answerCaseCount += 1;
        const firstRelevantRank = selectedIds.findIndex((id) => expectedIds.has(id));
        if (firstRelevantRank >= 0) reciprocalRankTotal += 1 / (firstRelevantRank + 1);
      }
    }
    if (request.mode === "category_browse") {
      browseTruePositives += caseTruePositives;
      browseFalsePositives += selectedIds.length - caseTruePositives;
    } else {
      nonBrowseCaseCount += 1;
    }
    if (evaluationCase.expectedMode) {
      modeCaseCount += 1;
      if (request.mode === evaluationCase.expectedMode) modeCorrectCount += 1;
      if (evaluationCase.expectedMode === "clarification") {
        clarificationCaseCount += 1;
        if (request.mode === "clarification") clarificationCorrectCount += 1;
      }
      if (evaluationCase.expectedMode !== "category_browse" && request.mode === "category_browse") unnecessaryBrowseCount += 1;
    }
    if (evaluationCase.tags.includes("unknown-category-no-use")) {
      unknownCategoryWrongUsageCount += selectedIds.length;
    }
  }

  const precision = divide(truePositives, truePositives + falsePositives);
  const recall = divide(truePositives, truePositives + falseNegatives);
  return {
    config: {
      version: MEMORY_RETRIEVAL_CONFIG.version,
      minimumScore: config.minimumScore,
      maxResults: config.maxResults,
      maxContextCharacters: config.maxContextCharacters,
      attributeStrategy: config.attributeStrategy,
      fallbackEnabled,
    },
    caseCount: memoryRetrievalEvaluationCases.length,
    metrics: {
      precision: round(precision),
      recall: round(recall),
      f1: round(divide(2 * precision * recall, precision + recall)),
      precisionAtK: round(precision),
      recallAtK: round(recall),
      meanReciprocalRank: round(divide(reciprocalRankTotal, answerCaseCount)),
      falsePositiveCount: falsePositives,
      missedCount: falseNegatives,
      noAnswerFalseAcceptanceRate: round(divide(noAnswerFalseAcceptanceCount, noAnswerCaseCount)),
      modeClassificationAccuracy: round(divide(modeCorrectCount, modeCaseCount)),
      categoryBrowseCandidatePrecision: round(divide(browseTruePositives, browseTruePositives + browseFalsePositives)),
      clarificationAccuracy: round(divide(clarificationCorrectCount, clarificationCaseCount)),
      unnecessaryCategoryBrowseRate: round(divide(unnecessaryBrowseCount, nonBrowseCaseCount)),
      unknownCategoryWrongMemoryUsageCount: unknownCategoryWrongUsageCount,
    },
  };
}

export function compareMemoryRetrievalSettings() {
  const base = {
    minimumScore: MEMORY_RETRIEVAL_CONFIG.minimumScore,
    maxResults: MEMORY_RETRIEVAL_CONFIG.maxResults,
    maxContextCharacters: MEMORY_RETRIEVAL_CONFIG.maxContextCharacters,
    browseMaxResults: MEMORY_RETRIEVAL_CONFIG.browseMaxResults,
    browseMaxContextCharacters: MEMORY_RETRIEVAL_CONFIG.browseMaxContextCharacters,
    attributeStrategy: MEMORY_RETRIEVAL_CONFIG.attributeStrategy,
  };
  return [
    ["phase7-ignore-no-fallback", { ...base, attributeStrategy: "ignore" }, false],
    ["exclude-no-fallback", { ...base, attributeStrategy: "exclude" }, false],
    ["score-no-fallback", { ...base, attributeStrategy: "score" }, false],
    ["production-exclude-with-fallback", base, true],
  ].map(([name, scenarioConfig, fallbackEnabled]) => ({
    name,
    ...evaluateMemoryRetrieval({ config: scenarioConfig, fallbackEnabled }),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(compareMemoryRetrievalSettings(), null, 2));
}
