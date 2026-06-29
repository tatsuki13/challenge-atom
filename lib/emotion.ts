import type { EmotionLabel } from "./conversationTypes";

const rules: Array<{ label: EmotionLabel; terms: string[] }> = [
  {
    label: "lonely",
    terms: ["寂しい", "さびしい", "ひとり", "一人", "孤独", "誰にも会わない"],
  },
  {
    label: "anxious",
    terms: ["不安", "心配", "怖い", "こわい", "落ち着かない", "眠れない"],
  },
  {
    label: "sad",
    terms: ["悲しい", "つらい", "泣いた", "疲れた", "しんどい"],
  },
  {
    label: "positive",
    terms: ["楽しい", "うれしい", "嬉しい", "よかった", "安心", "ありがとう"],
  },
  {
    label: "reminiscence",
    terms: ["昔", "若いころ", "子どものころ", "思い出", "懐かしい", "以前"],
  },
];

export function estimateEmotion(text: string): EmotionLabel {
  return rules.find((rule) => rule.terms.some((term) => text.includes(term)))
    ?.label ?? "neutral";
}
