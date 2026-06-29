import type { RiskLevel, StoredChatMessage } from "../conversationTypes";

export type ConversationMode =
  | "casual"
  | "reminiscence"
  | "loneliness"
  | "anxiety"
  | "daily_life"
  | "continuation"
  | "safety";

export type ResponseGoal =
  | "react"
  | "chat"
  | "continue"
  | "ask"
  | "reminisce"
  | "empathize"
  | "safety";

export type ConversationTurnPlan = {
  safetyLevel: RiskLevel;
  mode: ConversationMode;
  focusTerms: string[];
  mainFocus: string | null;
  responseGoal: ResponseGoal;
  shouldAskQuestion: boolean;
  avoidPatterns: string[];
};

type FocusCategory =
  | "person"
  | "place"
  | "food"
  | "activity"
  | "object"
  | "event"
  | "emotion"
  | "idea";

type FocusRule = {
  label: string;
  terms: string[];
  category: FocusCategory;
  weight: number;
};

type FocusCandidate = {
  label: string;
  category: FocusCategory;
  index: number;
  score: number;
};

const focusRules: FocusRule[] = [
  { label: "先生", terms: ["先生", "医者", "医師"], category: "person", weight: 120 },
  { label: "友人", terms: ["友人", "友達", "知り合い"], category: "person", weight: 115 },
  { label: "家族", terms: ["家族", "息子", "娘", "孫", "子ども", "子供"], category: "person", weight: 112 },
  { label: "夫", terms: ["夫", "主人"], category: "person", weight: 112 },
  { label: "妻", terms: ["妻", "家内"], category: "person", weight: 112 },
  { label: "スーパー", terms: ["スーパー"], category: "place", weight: 104 },
  { label: "病院", terms: ["病院", "医院", "診療所"], category: "place", weight: 104 },
  { label: "公園", terms: ["公園"], category: "place", weight: 102 },
  { label: "学校", terms: ["学校", "学生時代"], category: "place", weight: 102 },
  { label: "職場", terms: ["職場", "会社"], category: "place", weight: 102 },
  { label: "家", terms: ["家", "自宅", "部屋"], category: "place", weight: 88 },
  { label: "カレー", terms: ["カレー"], category: "food", weight: 118 },
  { label: "魚", terms: ["魚"], category: "food", weight: 108 },
  { label: "野菜", terms: ["野菜"], category: "food", weight: 108 },
  { label: "弁当", terms: ["弁当", "お弁当"], category: "food", weight: 108 },
  { label: "ご飯", terms: ["ご飯", "食事"], category: "food", weight: 96 },
  { label: "ハウジング", terms: ["ハウジング"], category: "activity", weight: 118 },
  { label: "畑", terms: ["畑"], category: "activity", weight: 122 },
  { label: "散歩", terms: ["散歩"], category: "activity", weight: 108 },
  { label: "テレビ", terms: ["テレビ"], category: "activity", weight: 100 },
  { label: "買い物", terms: ["買い物"], category: "activity", weight: 106 },
  { label: "料理", terms: ["料理", "作った"], category: "activity", weight: 100 },
  { label: "蔵", terms: ["蔵"], category: "object", weight: 132 },
  { label: "花", terms: ["花", "桜"], category: "object", weight: 112 },
  { label: "写真", terms: ["写真"], category: "object", weight: 110 },
  { label: "本", terms: ["本", "新聞"], category: "object", weight: 96 },
  { label: "トレンド", terms: ["トレンド", "流行", "人気"], category: "idea", weight: 78 },
  { label: "話した", terms: ["話した", "話して", "話しました", "おしゃべり"], category: "event", weight: 70 },
  { label: "電話", terms: ["電話"], category: "event", weight: 84 },
  { label: "会った", terms: ["会った", "会いました", "会えて"], category: "event", weight: 78 },
  { label: "出かけた", terms: ["出かけた", "外に出", "行った"], category: "event", weight: 70 },
  { label: "食べた", terms: ["食べた", "食べました"], category: "event", weight: 68 },
  { label: "見た", terms: ["見た", "見ました"], category: "event", weight: 62 },
  { label: "楽しい", terms: ["楽しい", "楽しかった", "うれしい", "嬉しい"], category: "emotion", weight: 40 },
  { label: "寂しい", terms: ["寂しい", "さびしい"], category: "emotion", weight: 48 },
  { label: "不安", terms: ["不安", "心配", "気になる"], category: "emotion", weight: 48 },
  { label: "疲れた", terms: ["疲れた", "疲れ"], category: "emotion", weight: 48 },
];

const katakanaStopWords = new Set(["テレビ", "スーパー", "カレー"]);

const reminiscenceTerms = [
  "昔",
  "若い頃",
  "若いころ",
  "思い出",
  "昔の仕事",
  "学生時代",
  "懐かしい",
  "畑",
];

const lonelinessTerms = [
  "寂しい",
  "さびしい",
  "ひとり",
  "一人",
  "誰とも話していない",
  "誰とも話してない",
  "孤独",
];

const anxietyTerms = [
  "不安",
  "心配",
  "眠れない",
  "気になる",
  "怖い",
  "こわい",
  "落ち着かない",
];

const dailyLifeTerms = [
  "食べた",
  "寝た",
  "散歩",
  "買い物",
  "病院",
  "疲れた",
  "スーパー",
  "ご飯",
];

const genericQuestionPatterns = [
  "その時はどんな感じでしたか？",
  "印象に残ったことはありましたか？",
  "睡眠はどうですか？",
  "食事はどうですか？",
  "誰と話しましたか？",
  "今日はどんな一日でしたか？",
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTermIndex(text: string, terms: string[]) {
  const indexes = terms
    .map((term) => text.indexOf(term))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function contextBoost({
  label,
  category,
  text,
}: {
  label: string;
  category: FocusCategory;
  text: string;
}) {
  let boost = 0;
  const escaped = escapeRegExp(label);

  if (new RegExp(`${escaped}.{0,8}(トレンド|流行|人気)`).test(text)) {
    boost += 60;
  }

  if (category === "object" && includesAny(text, ["トレンド", "流行", "人気"])) {
    boost += 35;
  }

  if (category === "person" && /話|電話|会/.test(text)) {
    boost += 30;
  }

  if (category === "food" && /食べ|作/.test(text)) {
    boost += 25;
  }

  return boost;
}

function mergeCandidate(
  candidates: Map<string, FocusCandidate>,
  candidate: FocusCandidate,
) {
  const existing = candidates.get(candidate.label);

  if (!existing || candidate.score > existing.score) {
    candidates.set(candidate.label, candidate);
  }
}

function extractKatakanaCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  const matches = text.matchAll(/[ァ-ヶー]{3,}/g);

  for (const match of matches) {
    const label = match[0];

    if (katakanaStopWords.has(label) || candidates.has(label)) {
      continue;
    }

    mergeCandidate(candidates, {
      label,
      category: "object",
      index: match.index ?? text.indexOf(label),
      score: 82,
    });
  }
}

function extractFocusCandidates(text: string) {
  const candidates = new Map<string, FocusCandidate>();

  for (const rule of focusRules) {
    const index = findTermIndex(text, rule.terms);

    if (index < 0) {
      continue;
    }

    mergeCandidate(candidates, {
      label: rule.label,
      category: rule.category,
      index,
      score:
        rule.weight +
        contextBoost({
          label: rule.label,
          category: rule.category,
          text,
        }),
    });
  }

  extractKatakanaCandidates(text, candidates);

  return [...candidates.values()].sort(
    (a, b) => b.score - a.score || a.index - b.index,
  );
}

function isConcreteCandidate(candidate: FocusCandidate) {
  return candidate.category !== "emotion";
}

function getAssistantReplies({
  recentMessages,
  recentAssistantReplies,
}: {
  recentMessages: StoredChatMessage[];
  recentAssistantReplies?: string[];
}) {
  if (recentAssistantReplies) {
    return recentAssistantReplies;
  }

  return recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content);
}

function endsWithQuestion(text: string) {
  return /[？?]\s*$/.test(text.trim());
}

function hasRecentQuestion(assistantReplies: string[]) {
  return assistantReplies.slice(-1).some(endsWithQuestion);
}

function hasTwoRecentQuestions(assistantReplies: string[]) {
  const recent = assistantReplies.slice(-2);

  return recent.length === 2 && recent.every(endsWithQuestion);
}

function looksLikeContinuation(text: string, recentMessages: StoredChatMessage[]) {
  const connectorCount = [
    "それで",
    "それから",
    "あと",
    "それに",
    "でも",
    "だから",
    "というのも",
  ].filter((term) => text.includes(term)).length;
  const lastAssistant = recentMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    text.length >= 90 ||
    connectorCount >= 2 ||
    /、$|…$|・・・$|\.{3}$/.test(text.trim()) ||
    (Boolean(lastAssistant?.content.includes("？")) && text.length >= 70)
  );
}

function detectMode({
  userMessage,
  recentMessages,
  safetyResult,
}: {
  userMessage: string;
  recentMessages: StoredChatMessage[];
  safetyResult: RiskLevel;
}): ConversationMode {
  if (safetyResult === "urgent") {
    return "safety";
  }

  if (includesAny(userMessage, reminiscenceTerms)) {
    return "reminiscence";
  }

  if (includesAny(userMessage, lonelinessTerms)) {
    return "loneliness";
  }

  if (includesAny(userMessage, anxietyTerms)) {
    return "anxiety";
  }

  if (includesAny(userMessage, dailyLifeTerms)) {
    return "daily_life";
  }

  if (looksLikeContinuation(userMessage, recentMessages)) {
    return "continuation";
  }

  return "casual";
}

function isShortAnswer(text: string, candidates: FocusCandidate[]) {
  const hasConcrete = candidates.some(isConcreteCandidate);

  return !hasConcrete && text.replace(/\s+/g, "").length <= 12;
}

function hasTalkEvent(text: string) {
  return /話|電話|おしゃべり|会/.test(text);
}

function chooseShouldAskQuestion({
  userMessage,
  mode,
  candidates,
  assistantReplies,
}: {
  userMessage: string;
  mode: ConversationMode;
  candidates: FocusCandidate[];
  assistantReplies: string[];
}) {
  if (mode === "safety") {
    return false;
  }

  if (hasRecentQuestion(assistantReplies) || hasTwoRecentQuestions(assistantReplies)) {
    return false;
  }

  if (isShortAnswer(userMessage, candidates)) {
    return false;
  }

  const hasPersonFocus = candidates.some((candidate) => candidate.category === "person");

  if (hasPersonFocus && hasTalkEvent(userMessage)) {
    return true;
  }

  if (mode === "reminiscence" && candidates.length > 0) {
    return true;
  }

  if (candidates.some(isConcreteCandidate)) {
    return false;
  }

  return mode === "anxiety" || mode === "loneliness";
}

function chooseResponseGoal({
  mode,
  candidates,
  shouldAskQuestion,
}: {
  mode: ConversationMode;
  candidates: FocusCandidate[];
  shouldAskQuestion: boolean;
}): ResponseGoal {
  if (mode === "safety") {
    return "safety";
  }

  if (mode === "continuation") {
    return "continue";
  }

  if (mode === "reminiscence") {
    return "reminisce";
  }

  if (
    (mode === "loneliness" || mode === "anxiety") &&
    !candidates.some(isConcreteCandidate)
  ) {
    return "empathize";
  }

  if (candidates.some(isConcreteCandidate)) {
    return shouldAskQuestion ? "chat" : "react";
  }

  return shouldAskQuestion ? "ask" : "chat";
}

function buildAvoidPatterns({
  mainFocus,
  shouldAskQuestion,
  assistantReplies,
}: {
  mainFocus: string | null;
  shouldAskQuestion: boolean;
  assistantReplies: string[];
}) {
  const recentOpeners = assistantReplies
    .slice(-3)
    .map((reply) => reply.replace(/\s+/g, " ").trim().slice(0, 14))
    .filter(Boolean);
  const patterns = [
    ...genericQuestionPatterns,
    "感情確認だけで返すこと",
    "生活情報のチェックリスト化",
    "面接のような質問攻め",
  ];

  if (mainFocus) {
    patterns.push(`「${mainFocus}」に触れずに返すこと`);
  }

  if (!shouldAskQuestion) {
    patterns.push("質問で終わること");
  }

  for (const opener of recentOpeners) {
    patterns.push(`直近と同じ出だし: ${opener}`);
  }

  return patterns;
}

export function analyzeConversationTurn({
  userMessage,
  recentMessages,
  recentAssistantReplies,
  safetyResult,
}: {
  userMessage: string;
  recentMessages: StoredChatMessage[];
  recentAssistantReplies?: string[];
  safetyResult: RiskLevel;
}): ConversationTurnPlan {
  const assistantReplies = getAssistantReplies({
    recentMessages,
    recentAssistantReplies,
  });
  const candidates = extractFocusCandidates(userMessage);
  const mode = detectMode({ userMessage, recentMessages, safetyResult });
  const shouldAskQuestion = chooseShouldAskQuestion({
    userMessage,
    mode,
    candidates,
    assistantReplies,
  });
  const mainFocus = candidates[0]?.label ?? null;

  return {
    safetyLevel: safetyResult,
    mode,
    focusTerms: candidates.map((candidate) => candidate.label).slice(0, 5),
    mainFocus,
    responseGoal: chooseResponseGoal({
      mode,
      candidates,
      shouldAskQuestion,
    }),
    shouldAskQuestion,
    avoidPatterns: buildAvoidPatterns({
      mainFocus,
      shouldAskQuestion,
      assistantReplies,
    }),
  };
}

export function getRecentAssistantReplies(messages: StoredChatMessage[]) {
  return messages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content);
}
