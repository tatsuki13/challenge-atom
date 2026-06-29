import type { EmotionLabel, StoredChatMessage } from "../conversationTypes";

type MoodSnapshot = {
  moodScoreStart: number | null;
  moodScoreEnd: number | null;
  startedAt: Date;
};

export type ConversationMemoryContext = {
  topTopics: string[];
  recentPeople: string[];
  frequentPlaces: string[];
  recurringConcerns: string[];
  coveredAreas: string[];
  recentUserNotes: string[];
  moodSummary: string | null;
  emotionSummary: string | null;
};

export type RelevantMemoryContext = Pick<
  ConversationMemoryContext,
  "topTopics" | "recentPeople" | "frequentPlaces" | "recurringConcerns"
>;

type KeywordRule = {
  label: string;
  terms: string[];
};

const topicRules: KeywordRule[] = [
  { label: "買い物", terms: ["スーパー", "買い物", "商店", "市場"] },
  { label: "散歩や外出", terms: ["散歩", "公園", "外出", "歩い", "出かけ"] },
  { label: "食事や料理", terms: ["ご飯", "食事", "料理", "味噌汁", "魚", "野菜"] },
  { label: "家族", terms: ["家族", "息子", "娘", "孫", "夫", "妻", "主人"] },
  { label: "近所や友人", terms: ["近所", "友人", "友達", "知り合い"] },
  { label: "体調", terms: ["疲れ", "しんどい", "痛い", "眠れ", "体"] },
  { label: "昔の思い出", terms: ["昔", "若いころ", "子どものころ", "懐かしい"] },
  { label: "季節", terms: ["桜", "花", "暑い", "寒い", "雨", "季節"] },
];

const areaRules: KeywordRule[] = [
  { label: "今日あったこと", terms: ["今日", "朝", "昼", "夕方", "昨日"] },
  { label: "気分の変化", terms: ["気分", "寂しい", "不安", "嬉しい", "楽しい"] },
  { label: "睡眠", terms: ["眠", "寝", "起き", "夜中"] },
  { label: "食事", terms: ["食べ", "ご飯", "食事", "料理"] },
  { label: "体調", terms: ["体", "疲れ", "痛い", "しんどい", "息", "胸"] },
  { label: "外出や活動", terms: ["外", "出かけ", "散歩", "歩い", "運動"] },
  { label: "人との交流", terms: ["話", "電話", "会っ", "連絡", "家族", "友人"] },
  { label: "好きなこと", terms: ["好き", "楽しみ", "趣味", "嬉しい"] },
  { label: "困りごと", terms: ["困", "心配", "不安", "つらい", "大変"] },
];

const peopleRules: KeywordRule[] = [
  { label: "家族", terms: ["家族", "息子", "娘", "孫"] },
  { label: "配偶者", terms: ["夫", "妻", "主人", "家内"] },
  { label: "近所の人", terms: ["近所", "お隣", "町内"] },
  { label: "友人", terms: ["友人", "友達", "知り合い"] },
  { label: "医療者", terms: ["先生", "医者", "看護師", "病院の人"] },
];

const placeRules: KeywordRule[] = [
  { label: "スーパー", terms: ["スーパー", "買い物"] },
  { label: "病院", terms: ["病院", "医院", "診療所"] },
  { label: "公園", terms: ["公園", "散歩道"] },
  { label: "畑や庭", terms: ["畑", "庭", "花壇"] },
  { label: "自宅", terms: ["家", "自宅", "部屋"] },
  { label: "商店街", terms: ["商店街", "市場", "商店"] },
];

const concernRules: KeywordRule[] = [
  { label: "眠れなさ", terms: ["眠れない", "寝つけない", "夜中"] },
  { label: "寂しさ", terms: ["寂しい", "さびしい", "ひとり", "孤独"] },
  { label: "不安や心配", terms: ["不安", "心配", "怖い", "気になる"] },
  { label: "体の痛みや疲れ", terms: ["痛い", "疲れ", "しんどい", "だるい"] },
  { label: "食事の少なさ", terms: ["食べていない", "食欲", "食べられない"] },
  { label: "人との接点の少なさ", terms: ["誰とも話していない", "誰にも会わない"] },
];

const emotionLabels: Record<EmotionLabel, string> = {
  lonely: "寂しさ",
  sad: "落ち込み",
  anxious: "不安",
  positive: "前向きな話題",
  reminiscence: "思い出話",
  neutral: "落ち着いた話題",
};

function clipForMemory(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 64);
}

function collectLabels(text: string, rules: KeywordRule[], limit: number) {
  return rules
    .filter((rule) => rule.terms.some((term) => text.includes(term)))
    .map((rule) => rule.label)
    .slice(0, limit);
}

function unique(values: string[], limit: number) {
  return [...new Set(values)].slice(0, limit);
}

function ruleMatchesLabel(
  label: string,
  text: string,
  rules: KeywordRule[],
) {
  const rule = rules.find((item) => item.label === label);

  return Boolean(
    text.includes(label) || rule?.terms.some((term) => text.includes(term)),
  );
}

function filterRelevantLabels({
  labels,
  text,
  rules,
  limit,
}: {
  labels: string[];
  text: string;
  rules: KeywordRule[];
  limit: number;
}) {
  return labels
    .filter((label) => ruleMatchesLabel(label, text, rules))
    .slice(0, limit);
}

function buildMoodSummary(snapshots: MoodSnapshot[]) {
  const scores = snapshots
    .map((snapshot) => snapshot.moodScoreEnd ?? snapshot.moodScoreStart)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) {
    return null;
  }

  const latest = scores[0];
  const average =
    scores.reduce((total, score) => total + score, 0) / scores.length;

  return `直近の自己申告は${latest}/5、最近の平均は${average.toFixed(1)}/5程度です。`;
}

function buildEmotionSummary(messages: StoredChatMessage[]) {
  const counts = new Map<EmotionLabel, number>();

  for (const message of messages) {
    if (!message.emotionLabel) {
      continue;
    }

    counts.set(message.emotionLabel, (counts.get(message.emotionLabel) ?? 0) + 1);
  }

  const topEmotions = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([emotion]) => emotionLabels[emotion]);

  return topEmotions.length > 0
    ? `最近は${topEmotions.join("、")}が出やすい会話です。`
    : null;
}

export function buildConversationMemoryContext({
  messages,
  moodSnapshots,
}: {
  messages: StoredChatMessage[];
  moodSnapshots: MoodSnapshot[];
}): ConversationMemoryContext {
  const userMessages = messages.filter((message) => message.role === "user");
  const userText = userMessages.map((message) => message.content).join("\n");
  const topTopics = unique(collectLabels(userText, topicRules, 8), 5);
  const recentPeople = unique(collectLabels(userText, peopleRules, 8), 4);
  const frequentPlaces = unique(collectLabels(userText, placeRules, 8), 4);
  const recurringConcerns = unique(collectLabels(userText, concernRules, 8), 4);
  const coveredAreas = unique(collectLabels(userText, areaRules, 12), 7);
  const recentUserNotes = userMessages
    .slice(-3)
    .map((message) => clipForMemory(message.content))
    .filter(Boolean);

  return {
    topTopics,
    recentPeople,
    frequentPlaces,
    recurringConcerns,
    coveredAreas,
    recentUserNotes,
    moodSummary: buildMoodSummary(
      moodSnapshots
        .slice()
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    ),
    emotionSummary: buildEmotionSummary(messages),
  };
}

export function selectRelevantMemoryContext({
  memoryContext,
  currentMessage,
}: {
  memoryContext: ConversationMemoryContext | null;
  currentMessage: string;
}): RelevantMemoryContext | null {
  if (!memoryContext) {
    return null;
  }

  const relevantMemory = {
    topTopics: filterRelevantLabels({
      labels: memoryContext.topTopics,
      text: currentMessage,
      rules: topicRules,
      limit: 2,
    }),
    recentPeople: filterRelevantLabels({
      labels: memoryContext.recentPeople,
      text: currentMessage,
      rules: peopleRules,
      limit: 2,
    }),
    frequentPlaces: filterRelevantLabels({
      labels: memoryContext.frequentPlaces,
      text: currentMessage,
      rules: placeRules,
      limit: 2,
    }),
    recurringConcerns: filterRelevantLabels({
      labels: memoryContext.recurringConcerns,
      text: currentMessage,
      rules: concernRules,
      limit: 2,
    }),
  };

  const hasRelevantMemory = Object.values(relevantMemory).some(
    (items) => items.length > 0,
  );

  return hasRelevantMemory ? relevantMemory : null;
}

export function getMoodDirection(moodScore: number | null) {
  if (moodScore === 1) {
    return [
      "今日の気分はかなり重い自己申告です。",
      "ただし、返答の主題は必ず最後の発話内容にしてください。",
      "この情報は、語調を少しゆっくり・やわらかくするためだけに使ってください。",
    ];
  }

  if (moodScore === 2) {
    return [
      "今日の気分は少し重い自己申告です。",
      "ただし、気分スコアから話題を選ばないでください。",
      "最後の発話が不安や疲れに触れていない限り、その話題へ展開しないでください。",
    ];
  }

  if (moodScore === 3) {
    return [
      "今日の気分は普通の自己申告です。",
      "特別な方向づけはせず、最後の発話内容に自然に返してください。",
    ];
  }

  if (moodScore === 4) {
    return [
      "今日の気分はまあ良い自己申告です。",
      "語調を少し明るめにしてもよいですが、話題は最後の発話に合わせてください。",
      "良かったことや外出の話へ、発話にないのに展開しないでください。",
    ];
  }

  if (moodScore === 5) {
    return [
      "今日の気分は良い自己申告です。",
      "語調を少し軽くしてもよいですが、返答の主題は最後の発話内容です。",
      "気分が良いからといって、楽しい話題へ無理に誘導しないでください。",
    ];
  }

  return [
    "今日の気分は未選択です。",
    "気分スコアで推測せず、今の発話内容と会話履歴を優先してください。",
  ];
}

export function buildAdaptiveGuidance({
  moodScore,
}: {
  moodScore: number | null;
}) {
  const lines = [
    "# 今回の対話調整",
    "以下は内部参考情報です。利用者には説明せず、返答を自然に調整するためだけに使ってください。",
    "最優先は最後の利用者発話です。気分スコアは返答の主題や展開先を決める材料ではありません。",
    "",
    "## 今日の気分の扱い",
    ...getMoodDirection(moodScore).map((line) => `- ${line}`),
  ];

  lines.push(
    "",
    "## 使い方",
    "- 気分スコアから感情を決めつけないでください。",
    "- 気分スコアを理由に、発話にない話題へ展開しないでください。",
    "- 最後の発話への自然な返事を最優先してください。",
    "- 気分に触れる場合も、分類や分析として言わないでください。",
  );

  return lines.join("\n");
}
