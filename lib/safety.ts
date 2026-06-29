import type { RiskLevel } from "./conversationTypes";

const urgentTerms = [
  "死にたい",
  "消えたい",
  "自殺",
  "もう生きたくない",
  "倒れた",
  "倒れそう",
  "動けない",
  "息が苦しい",
  "胸が痛い",
  "救急車",
  "意識が",
];

const watchTerms = [
  "つらい",
  "寂しい",
  "さびしい",
  "誰にも会わない",
  "食べていない",
  "眠れない",
  "不安",
];

export function detectRisk(text: string): RiskLevel {
  if (urgentTerms.some((term) => text.includes(term))) {
    return "urgent";
  }

  if (watchTerms.some((term) => text.includes(term))) {
    return "watch";
  }

  return "none";
}

export function getUrgentSafetyReply() {
  return "今、とても心配な状態ですね。ひとりで抱えず、すぐ近くの人、家族、医療機関、地域の相談窓口に連絡してください。身体の症状や差し迫った危険がある場合は、119など地域の緊急窓口へ連絡してください。";
}
