import type { RiskLevel, StoredChatMessage } from "../conversationTypes";

export type ConversationMode =
  | "casual"
  | "reminiscence"
  | "loneliness"
  | "anxiety"
  | "daily_life"
  | "continuation"
  | "safety";

export type EventType =
  | "talked_with"
  | "met"
  | "went_to"
  | "ate"
  | "saw"
  | "made"
  | "heard_about"
  | "is_trending"
  | "remembered"
  | "felt"
  | "unknown";

export type TopicType =
  | "person"
  | "place"
  | "food"
  | "activity"
  | "object"
  | "memory"
  | "feeling"
  | "unknown";

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
  eventType: EventType;
  relationHint: string | null;
  topicType: TopicType;
  responseGoal: ResponseGoal;
  shouldAskQuestion: boolean;
  avoidPatterns: string[];
};

type CandidateSource = "pattern" | "proper_noun" | "dictionary";

type FocusRule = {
  label: string;
  terms: string[];
  topicType: TopicType;
  weight: number;
};

type FocusCandidate = {
  label: string;
  eventType: EventType;
  relationHint: string | null;
  topicType: TopicType;
  index: number;
  score: number;
  source: CandidateSource;
};

type PatternRule = {
  eventType: EventType;
  topicType: TopicType;
  relationHint: string | null;
  score: number;
  patterns: RegExp[];
};

const focusRules: FocusRule[] = [
  { label: "先生", terms: ["先生", "医者", "医師"], topicType: "person", weight: 86 },
  { label: "友人", terms: ["友人", "友達", "知り合い"], topicType: "person", weight: 84 },
  { label: "家族", terms: ["家族", "息子", "娘", "孫", "子ども", "子供"], topicType: "person", weight: 82 },
  { label: "夫", terms: ["夫", "主人"], topicType: "person", weight: 82 },
  { label: "妻", terms: ["妻", "家内"], topicType: "person", weight: 82 },
  { label: "スーパー", terms: ["スーパー"], topicType: "place", weight: 76 },
  { label: "病院", terms: ["病院", "医院", "診療所"], topicType: "place", weight: 76 },
  { label: "公園", terms: ["公園"], topicType: "place", weight: 74 },
  { label: "学校", terms: ["学校", "学生時代"], topicType: "place", weight: 72 },
  { label: "職場", terms: ["職場", "会社"], topicType: "place", weight: 72 },
  { label: "カレー", terms: ["カレー"], topicType: "food", weight: 80 },
  { label: "魚", terms: ["魚"], topicType: "food", weight: 72 },
  { label: "野菜", terms: ["野菜"], topicType: "food", weight: 72 },
  { label: "弁当", terms: ["弁当", "お弁当"], topicType: "food", weight: 72 },
  { label: "ハウジング", terms: ["ハウジング"], topicType: "activity", weight: 78 },
  { label: "畑", terms: ["畑"], topicType: "activity", weight: 80 },
  { label: "散歩", terms: ["散歩"], topicType: "activity", weight: 72 },
  { label: "テレビ", terms: ["テレビ"], topicType: "activity", weight: 66 },
  { label: "買い物", terms: ["買い物"], topicType: "activity", weight: 70 },
  { label: "蔵", terms: ["蔵"], topicType: "object", weight: 82 },
  { label: "花", terms: ["花", "桜"], topicType: "object", weight: 72 },
  { label: "写真", terms: ["写真"], topicType: "object", weight: 72 },
  { label: "本", terms: ["本", "新聞"], topicType: "object", weight: 62 },
  { label: "楽しい", terms: ["楽しい", "楽しかった", "うれしい", "嬉しい"], topicType: "feeling", weight: 34 },
  { label: "寂しい", terms: ["寂しい", "さびしい"], topicType: "feeling", weight: 38 },
  { label: "不安", terms: ["不安", "心配", "気になる"], topicType: "feeling", weight: 38 },
  { label: "疲れた", terms: ["疲れた", "疲れ"], topicType: "feeling", weight: 38 },
];

const patternRules: PatternRule[] = [
  {
    eventType: "is_trending",
    topicType: "object",
    relationHint: null,
    score: 330,
    patterns: [
      /(?:最近は|最近|今は)?(.{1,32}?)(?:が|は)(?:トレンド|流行っている|流行ってる|流行|人気)(?:らしい|みたい|です|だ|になっている|になってる)?/,
    ],
  },
  {
    eventType: "talked_with",
    topicType: "person",
    relationHint: "話し相手",
    score: 310,
    patterns: [
      /(.{1,32}?)(?:と|に)(?:たくさん|少し|ちょっと)?(?:話した|話しました|話していた|話してた|おしゃべりをした|おしゃべりした|おしゃべりをしました|おしゃべりしました)/,
    ],
  },
  {
    eventType: "met",
    topicType: "person",
    relationHint: "会った相手",
    score: 300,
    patterns: [
      /(.{1,32}?)(?:に|と)(?:会った|会いました|会ってきた|会ってきました|会えた|会えました)/,
    ],
  },
  {
    eventType: "heard_about",
    topicType: "person",
    relationHint: "話の出どころ",
    score: 292,
    patterns: [
      /(.{1,32}?)(?:から聞いた|から聞きました|に言われた|に言われました)/,
    ],
  },
  {
    eventType: "went_to",
    topicType: "place",
    relationHint: null,
    score: 286,
    patterns: [
      /(.{1,32}?)(?:へ|に|まで)(?:行った|行きました|出かけた|出かけました|寄った|寄りました)/,
    ],
  },
  {
    eventType: "ate",
    topicType: "food",
    relationHint: null,
    score: 282,
    patterns: [
      /(.{1,24}?)(?:を)?(?:食べた|食べました)/,
    ],
  },
  {
    eventType: "made",
    topicType: "food",
    relationHint: null,
    score: 274,
    patterns: [
      /(.{1,24}?)(?:を)?(?:作った|作りました|買った|買いました)/,
    ],
  },
  {
    eventType: "saw",
    topicType: "object",
    relationHint: null,
    score: 266,
    patterns: [
      /(.{1,24}?)(?:を)?(?:見た|見ました|見かけた|見かけました)/,
    ],
  },
  {
    eventType: "heard_about",
    topicType: "activity",
    relationHint: "話題",
    score: 258,
    patterns: [
      /(.{1,32}?)(?:について|の話を|の話)(?:話した|話しました|話していた|話してた|聞いた|聞きました)/,
    ],
  },
  {
    eventType: "remembered",
    topicType: "memory",
    relationHint: null,
    score: 250,
    patterns: [
      /昔は(.{1,32}?)(?:していた|していました|してた|だった|でした)/,
      /若い頃は(.{1,32}?)(?:していた|していました|してた|だった|でした)/,
      /前は(.{1,32}?)(?:していた|していました|してた|だった|でした)/,
      /昔の(.{1,32}?)(?:を)?思い出した/,
      /(.{1,32}?)(?:を)?思い出した/,
    ],
  },
  {
    eventType: "felt",
    topicType: "feeling",
    relationHint: null,
    score: 100,
    patterns: [
      /(.{1,16}?)(?:かった|でした|です|だよ|だね)$/,
    ],
  },
];

const katakanaStopWords = new Set(["テレビ", "スーパー", "カレー"]);
const leadingNoise = [
  "今日は",
  "今日",
  "昨日は",
  "昨日",
  "この前は",
  "この前",
  "最近は",
  "最近",
  "昔は",
  "前は",
  "若い頃は",
  "若いころは",
  "ちょっと",
  "たくさん",
];
const trailingNoisePattern =
  /(について|の話|のこと|を|に|へ|まで|と|が|は|も|で|から|です|でした|だった|だ|らしい|みたい|していた|してた)$/;

const reminiscenceTerms = [
  "昔",
  "若い頃",
  "若いころ",
  "思い出",
  "昔の仕事",
  "学生時代",
  "懐かしい",
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
  "行った",
];

const genericQuestionPatterns = [
  "その時はどんな感じでしたか？",
  "印象に残ったことはありましたか？",
  "どう思いましたか？",
  "どんな気持ちでしたか？",
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

function normalizeFocus(raw: string) {
  const segments = raw
    .split(/(?:だけど|けど|けれど|、|。)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  let text = segments.at(-1) ?? raw;

  for (const marker of ["最近は", "最近", "今は"]) {
    const index = text.lastIndexOf(marker);

    if (index > 0) {
      text = text.slice(index + marker.length);
    }
  }

  text = text.replace(/[「」『』"'.、。！？!?]/g, "").replace(/\s+/g, "").trim();

  for (const noise of leadingNoise) {
    if (text.startsWith(noise)) {
      text = text.slice(noise.length);
    }
  }

  let previous = "";
  while (text && previous !== text) {
    previous = text;
    text = text.replace(trailingNoisePattern, "");
  }

  return text.trim();
}

function isUsableFocus(text: string) {
  return text.length > 0 && text.length <= 32 && !/^(こと|もの|それ|これ|あれ)$/.test(text);
}

function findTermIndex(text: string, terms: string[]) {
  const indexes = terms
    .map((term) => text.indexOf(term))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function knownTopicType(label: string): TopicType | null {
  const rule = focusRules.find(
    (item) => item.label === label || item.terms.includes(label),
  );

  return rule?.topicType ?? null;
}

function topicTypeForPattern(label: string, fallback: TopicType) {
  if (fallback === "memory" || fallback === "person") {
    return fallback;
  }

  return knownTopicType(label) ?? fallback;
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

function extractPatternCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  for (const rule of patternRules) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text);
      const rawFocus = match?.[1];

      if (!rawFocus) {
        continue;
      }

      const label = normalizeFocus(rawFocus);

      if (!isUsableFocus(label)) {
        continue;
      }

      mergeCandidate(candidates, {
        label,
        eventType: rule.eventType,
        relationHint: rule.relationHint,
        topicType: topicTypeForPattern(label, rule.topicType),
        index: match.index + match[0].indexOf(rawFocus),
        score: rule.score,
        source: "pattern",
      });
    }
  }
}

function extractDictionaryCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  for (const rule of focusRules) {
    const index = findTermIndex(text, rule.terms);

    if (index < 0) {
      continue;
    }

    const isFeeling = rule.topicType === "feeling";

    mergeCandidate(candidates, {
      label: rule.label,
      eventType: isFeeling ? "felt" : "unknown",
      relationHint: null,
      topicType: rule.topicType,
      index,
      score: rule.weight,
      source: "dictionary",
    });
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
      eventType: "unknown",
      relationHint: null,
      topicType: "object",
      index: match.index ?? text.indexOf(label),
      score: 130,
      source: "proper_noun",
    });
  }
}

function boostContext(candidate: FocusCandidate, text: string) {
  let score = candidate.score;
  const escaped = escapeRegExp(candidate.label);

  if (new RegExp(`${escaped}.{0,8}(トレンド|流行|人気)`).test(text)) {
    score += 45;
  }

  if (candidate.topicType === "person" && /話|電話|おしゃべり|会/.test(text)) {
    score += 25;
  }

  if (candidate.topicType === "food" && /食べ|作|買/.test(text)) {
    score += 20;
  }

  if (candidate.eventType !== "unknown") {
    score += 20;
  }

  return { ...candidate, score };
}

function extractFocusCandidates(text: string) {
  const candidates = new Map<string, FocusCandidate>();

  extractPatternCandidates(text, candidates);
  extractKatakanaCandidates(text, candidates);
  extractDictionaryCandidates(text, candidates);

  return [...candidates.values()]
    .map((candidate) => boostContext(candidate, text))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function isConcreteCandidate(candidate: FocusCandidate) {
  return candidate.topicType !== "feeling";
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
  topCandidate,
}: {
  userMessage: string;
  recentMessages: StoredChatMessage[];
  safetyResult: RiskLevel;
  topCandidate: FocusCandidate | null;
}): ConversationMode {
  if (safetyResult === "urgent") {
    return "safety";
  }

  if (
    topCandidate?.eventType === "remembered" ||
    topCandidate?.topicType === "memory" ||
    includesAny(userMessage, reminiscenceTerms)
  ) {
    return "reminiscence";
  }

  if (includesAny(userMessage, lonelinessTerms)) {
    return "loneliness";
  }

  if (includesAny(userMessage, anxietyTerms)) {
    return "anxiety";
  }

  if (
    topCandidate?.eventType === "ate" ||
    topCandidate?.eventType === "went_to" ||
    includesAny(userMessage, dailyLifeTerms)
  ) {
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

function chooseShouldAskQuestion({
  userMessage,
  mode,
  topCandidate,
  candidates,
  assistantReplies,
}: {
  userMessage: string;
  mode: ConversationMode;
  topCandidate: FocusCandidate | null;
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

  if (
    topCandidate?.eventType === "talked_with" ||
    topCandidate?.eventType === "met"
  ) {
    return true;
  }

  if (
    topCandidate?.eventType === "ate" ||
    topCandidate?.eventType === "is_trending" ||
    topCandidate?.eventType === "remembered"
  ) {
    return false;
  }

  if (candidates.some(isConcreteCandidate)) {
    return false;
  }

  return mode === "anxiety" || mode === "loneliness";
}

function chooseResponseGoal({
  mode,
  topCandidate,
  shouldAskQuestion,
}: {
  mode: ConversationMode;
  topCandidate: FocusCandidate | null;
  shouldAskQuestion: boolean;
}): ResponseGoal {
  if (mode === "safety") {
    return "safety";
  }

  if (mode === "continuation") {
    return "continue";
  }

  if (topCandidate?.eventType === "remembered" || mode === "reminiscence") {
    return "reminisce";
  }

  if (
    (mode === "loneliness" || mode === "anxiety") &&
    (!topCandidate || topCandidate.topicType === "feeling")
  ) {
    return "empathize";
  }

  if (topCandidate?.eventType === "talked_with" || topCandidate?.eventType === "met") {
    return "chat";
  }

  if (topCandidate && topCandidate.topicType !== "feeling") {
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
  const topCandidate = candidates[0] ?? null;
  const mode = detectMode({
    userMessage,
    recentMessages,
    safetyResult,
    topCandidate,
  });
  const shouldAskQuestion = chooseShouldAskQuestion({
    userMessage,
    mode,
    topCandidate,
    candidates,
    assistantReplies,
  });
  const mainFocus = topCandidate?.label ?? null;

  return {
    safetyLevel: safetyResult,
    mode,
    focusTerms: candidates.map((candidate) => candidate.label).slice(0, 5),
    mainFocus,
    eventType: topCandidate?.eventType ?? "unknown",
    relationHint: topCandidate?.relationHint ?? null,
    topicType: topCandidate?.topicType ?? "unknown",
    responseGoal: chooseResponseGoal({
      mode,
      topCandidate,
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
