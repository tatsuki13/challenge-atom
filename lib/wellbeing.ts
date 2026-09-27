export type EmotionScores = {
  loneliness: number;
  anxiety: number;
  positive_affect: number;
  interest: number;
};

export type PhysicalSignals = {
  sleepMinutes: number | null;
  steps: number | null;
  restingHeartRate: number | null;
  recordedAt: string | null;
  source: string | null;
};

const emotionTerms = {
  loneliness: ["寂しい", "さびしい", "ひとり", "一人ぼっち", "孤独", "誰にも会わない"],
  anxiety: ["不安", "心配", "怖い", "こわい", "緊張", "落ち着かない", "眠れない"],
  positive_affect: ["楽しい", "うれしい", "嬉しい", "よかった", "安心", "幸せ", "ありがとう"],
  interest: ["好き", "趣味", "興味", "気になる", "楽しみ", "夢中", "面白い", "おもしろい"],
} as const;

export function scoreEmotions(text: string): EmotionScores {
  const result = {} as EmotionScores;
  for (const key of Object.keys(emotionTerms) as (keyof EmotionScores)[]) {
    const count = emotionTerms[key].filter((term) => text.includes(term)).length;
    result[key] = count === 0 ? 0 : Math.min(1, 0.45 + 0.2 * (count - 1));
  }
  return result;
}

export function suggestConversation(scores: EmotionScores, physical: PhysicalSignals | null) {
  if (scores.anxiety >= 0.45) return "不安を短く受け止め、質問を重ねずに話を聞く";
  if (scores.loneliness >= 0.45) return "孤独感を受け止め、人とのつながりに関する話題を穏やかに提案する";
  if (physical?.sleepMinutes != null && physical.sleepMinutes < 360)
    return "睡眠が短めなので、負担の少ない穏やかな話題にする";
  if (scores.positive_affect >= 0.45 || scores.interest >= 0.45)
    return "楽しい・関心のある具体的な話題を自然に広げる";
  return "発話の具体的な内容を中心に自然な会話を続ける";
}
