import type { RiskLevel, StoredChatMessage } from "../conversationTypes";

export type ConversationMode =
  | "casual"
  | "reminiscence"
  | "loneliness"
  | "anxiety"
  | "daily_life"
  | "continuation"
  | "safety";

type Rule = {
  mode: Exclude<ConversationMode, "casual" | "continuation" | "safety">;
  terms: string[];
};

const modeRules: Rule[] = [
  {
    mode: "loneliness",
    terms: [
      "寂しい",
      "さびしい",
      "ひとり",
      "一人",
      "孤独",
      "誰とも話していない",
      "誰にも会わない",
      "亡くなった",
      "死別",
    ],
  },
  {
    mode: "anxiety",
    terms: [
      "不安",
      "心配",
      "眠れない",
      "気になる",
      "怖い",
      "こわい",
      "落ち着かない",
    ],
  },
  {
    mode: "reminiscence",
    terms: [
      "昔",
      "若い頃",
      "若いころ",
      "思い出",
      "懐かしい",
      "以前",
      "仕事していた頃",
      "子どものころ",
      "夫",
      "妻",
      "主人",
    ],
  },
  {
    mode: "daily_life",
    terms: [
      "食べた",
      "食事",
      "ご飯",
      "寝た",
      "眠れ",
      "散歩",
      "病院",
      "買い物",
      "スーパー",
      "体調",
      "疲れ",
      "掃除",
      "洗濯",
      "外に出",
    ],
  },
];

function looksLikeContinuation(text: string, recentMessages: StoredChatMessage[]) {
  const normalized = text.trim();
  const lastAssistant = recentMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  const assistantAskedQuestion = Boolean(lastAssistant?.content.includes("？"));

  return (
    normalized.length >= 90 ||
    /、$|…$|・・・$|\.{3}$/.test(normalized) ||
    /(それで|それから|あと|まだ|続き|というのも)$/.test(normalized) ||
    (assistantAskedQuestion && normalized.length >= 55)
  );
}

export function detectConversationMode({
  message,
  riskLevel,
  recentMessages,
}: {
  message: string;
  riskLevel: RiskLevel;
  recentMessages: StoredChatMessage[];
}): ConversationMode {
  if (riskLevel === "urgent") {
    return "safety";
  }

  if (looksLikeContinuation(message, recentMessages)) {
    return "continuation";
  }

  const matchedRule = modeRules.find((rule) =>
    rule.terms.some((term) => message.includes(term)),
  );

  return matchedRule?.mode ?? "casual";
}

export function buildConversationModeInstruction(mode: ConversationMode) {
  const modeInstructions: Record<ConversationMode, string> = {
    casual:
      "casual: 日常雑談。情報収集より会話を楽しむ。食べ物、天気、買い物、テレビ、庭、散歩などの話を自然に広げる。",
    reminiscence:
      "reminiscence: 昔話、思い出、好きだったことを遮らず広げる。本人らしさ、大切にしていたこと、好きだった場所にやわらかく触れる。",
    loneliness:
      "loneliness: 寂しさ、喪失感、孤独を無理に励まさず受け止める。すぐに外出や家族連絡を提案しない。",
    anxiety:
      "anxiety: 不安を否定せず、すぐ解決策を出さない。今いちばん気になっていることを一つだけ聞く。",
    daily_life:
      "daily_life: 食事、睡眠、外出、体調、家事などをチェックリスト化せず、話題に近いところから自然に広げる。",
    continuation:
      "continuation: 利用者がまだ話したそうな状態。質問よりも続きを促し、話の腰を折らない。",
    safety:
      "safety: 自傷、急病、強い危機表現。短く受け止め、安全確保と身近な人・医療機関・緊急窓口への連絡を促す。",
  };

  return [
    "# 会話モードの軽いヒント",
    `- 推定モード: ${mode}`,
    `- 補助方針: ${modeInstructions[mode]}`,
    "- このモード判定は返答を固定するものではありません。",
    "- 最後の利用者発話と合わない場合は、最後の発話の内容と温度感を優先してください。",
    "- モード名や分類名を利用者に伝えないでください。",
  ].join("\n");
}
