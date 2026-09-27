import type {
  ListeningStrategy,
  RiskLevel,
  StoredChatMessage,
} from "../conversationTypes";

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

export type ResponsePurpose =
  | "receive"
  | "continue_topic"
  | "clarify"
  | "follow_preference"
  | "pause_or_close"
  | "safety";

export type QuestionPolicy = "avoid" | "optional" | "required";

export type ConversationSignals = {
  shortReply: boolean;
  recentQuestionCount: number;
  repeatedQuestions: boolean;
  topicChangeRequested: boolean;
  topicChangeTargetProvided: boolean;
  proposalRejected: boolean;
  pauseRequested: boolean;
  lowEnergyStatement: boolean;
  explicitFeeling: boolean;
  suggestionRequested: boolean;
  weatherMentioned: boolean;
  photoMentioned: boolean;
};

export type ConversationTurnPlan = {
  safetyLevel: RiskLevel;
  mode: ConversationMode;
  focusTerms: string[];
  mainFocus: string | null;
  eventType: EventType;
  relationHint: string | null;
  topicType: TopicType;
  responsePurpose: ResponsePurpose;
  questionPolicy: QuestionPolicy;
  conversationSignals: ConversationSignals;
  listeningStrategy: ListeningStrategy;
  shouldAskQuestion: boolean;
  suggestedQuestion?: string | null;
  avoidPatterns: string[];
};

type CandidateSource = "pattern" | "proper_noun" | "dictionary" | "inferred";

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
  { label: "先輩", terms: ["先輩"], topicType: "person", weight: 85 },
  { label: "後輩", terms: ["後輩"], topicType: "person", weight: 83 },
  { label: "友人", terms: ["友人", "友達", "知り合い", "ご近所", "近所の人", "町内会の人"], topicType: "person", weight: 84 },
  { label: "家族", terms: ["家族", "息子", "娘", "孫", "子ども", "子供"], topicType: "person", weight: 82 },
  { label: "夫", terms: ["夫", "主人"], topicType: "person", weight: 82 },
  { label: "妻", terms: ["妻", "家内"], topicType: "person", weight: 82 },
  { label: "スーパー", terms: ["スーパー", "商店街", "市場"], topicType: "place", weight: 76 },
  { label: "喫茶店", terms: ["喫茶店", "カフェ"], topicType: "place", weight: 75 },
  { label: "病院", terms: ["病院", "医院", "診療所"], topicType: "place", weight: 76 },
  { label: "公園", terms: ["公園"], topicType: "place", weight: 74 },
  { label: "川", terms: ["川"], topicType: "place", weight: 74 },
  { label: "海", terms: ["海"], topicType: "place", weight: 72 },
  { label: "山", terms: ["山"], topicType: "place", weight: 72 },
  { label: "神社", terms: ["神社", "お寺"], topicType: "place", weight: 70 },
  { label: "学校", terms: ["学校", "学生時代"], topicType: "place", weight: 72 },
  { label: "職場", terms: ["職場", "会社"], topicType: "place", weight: 72 },
  { label: "カレー", terms: ["カレー"], topicType: "food", weight: 80 },
  { label: "魚", terms: ["魚"], topicType: "food", weight: 72 },
  { label: "野菜", terms: ["野菜"], topicType: "food", weight: 72 },
  { label: "弁当", terms: ["弁当", "お弁当"], topicType: "food", weight: 72 },
  { label: "モーニング", terms: ["モーニング", "朝ごはん", "朝食"], topicType: "food", weight: 73 },
  { label: "お茶", terms: ["お茶", "コーヒー", "紅茶"], topicType: "food", weight: 68 },
  { label: "ハウジング", terms: ["ハウジング"], topicType: "activity", weight: 78 },
  { label: "畑", terms: ["畑"], topicType: "activity", weight: 80 },
  { label: "散歩", terms: ["散歩"], topicType: "activity", weight: 72 },
  { label: "テレビ", terms: ["テレビ"], topicType: "activity", weight: 66 },
  { label: "買い物", terms: ["買い物"], topicType: "activity", weight: 70 },
  { label: "編み物", terms: ["編み物", "手芸", "裁縫", "手仕事"], topicType: "activity", weight: 74 },
  { label: "町内会", terms: ["町内会", "自治会"], topicType: "activity", weight: 70 },
  { label: "ニュース", terms: ["ニュース", "新聞"], topicType: "object", weight: 67 },
  { label: "蔵", terms: ["蔵"], topicType: "object", weight: 82 },
  { label: "花", terms: ["花", "桜"], topicType: "object", weight: 72 },
  { label: "写真", terms: ["写真"], topicType: "object", weight: 72 },
  { label: "本", terms: ["本", "新聞"], topicType: "object", weight: 62 },
  { label: "楽しい", terms: ["楽しい", "楽しかった", "うれしい", "嬉しい"], topicType: "feeling", weight: 34 },
  { label: "寂しい", terms: ["寂しい", "さびしい"], topicType: "feeling", weight: 38 },
  { label: "不安", terms: ["不安", "心配", "気になる"], topicType: "feeling", weight: 38 },
  { label: "疲れた", terms: ["疲れた", "疲れ"], topicType: "feeling", weight: 38 },
  { label: "だるい", terms: ["だるい", "だるさ", "しんどい", "体が重い"], topicType: "feeling", weight: 38 },
];

const patternRules: PatternRule[] = [
  {
    eventType: "heard_about",
    topicType: "activity",
    relationHint: "今日の話題",
    score: 345,
    patterns: [
      /今日の話題[:：]\s*(.{1,40})/,
    ],
  },
  {
    eventType: "remembered",
    topicType: "place",
    relationHint: "昔遊んだ場所",
    score: 338,
    patterns: [
      /(?:昔は|若い頃は|子どものころは|子供のころは)(.{1,24}?)(?:で|に)(?:よく)?(?:遊んでいた|遊んでいました|遊んだ|遊びました)/,
    ],
  },
  {
    eventType: "heard_about",
    topicType: "activity",
    relationHint: "盛り上がった話題",
    score: 336,
    patterns: [
      /(.{1,28}?)(?:の話で|について)(?:盛り上がった|盛り上がりました|話が弾んだ|話がはずんだ)/,
    ],
  },
  {
    eventType: "ate",
    topicType: "food",
    relationHint: "食べたもの",
    score: 334,
    patterns: [
      /(?:.+?で)?([^でを、。]{1,24})(?:を)?(?:食べた|食べました)/,
    ],
  },
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
const weakFocusStopWords = new Set([
  "今日",
  "今日は",
  "昨日",
  "昨日は",
  "最近",
  "最近は",
  "この前",
  "この前は",
  "私",
  "わたし",
  "自分",
  "こと",
  "もの",
  "ところ",
  "感じ",
  "話",
  "会話",
  "内容",
  "時間",
  "一日",
  "少し",
  "ちょっと",
  "たくさん",
  "なんか",
  "だいぶ",
  "全然",
  "やはり",
  "話題",
]);
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
  "全然",
  "だいぶ",
  "やはり",
];
const trailingNoisePattern =
  /(について|の話|のこと|を|に|へ|まで|が|は|も|で|から|です|でした|だった|だ|らしい|みたい|していた|してた)$/;

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

const noAnswerTerms = [
  "分からない",
  "わからない",
  "分かりません",
  "わかりません",
  "特にない",
  "別にない",
  "何もない",
  "思いつかない",
];

const topicChangeTerms = [
  "別の話",
  "ほかの話",
  "他の話",
  "話題を変え",
  "話を変え",
];

const pauseTerms = [
  "休みたい",
  "少し休む",
  "もう休む",
  "今日は終わり",
  "もう終わり",
  "また今度",
  "今日はもういい",
];
const lowEnergyTerms = ["だるい", "だるさ", "しんどい", "体が重い", "疲れた"];
const suggestionRequestTerms = [
  "どうしたら",
  "どうすれば",
  "何かない",
  "おすすめ",
  "提案して",
  "考えてほしい",
  "何をしたら",
];
const proposalRejectionTerms = [
  "しなくていい",
  "したくない",
  "やりたくない",
  "やめておく",
  "遠慮します",
  "結構です",
  "今はいい",
  "いりません",
  "要りません",
];
const proposalPattern =
  /(?:してみませんか|してみては|どうですか|いかがですか|よかったら|おすすめ|試して|連絡して|電話して|出かけて)/;

const ambiguousReferencePattern = /(?:それ|これ|あれ|その人|あの人|そこ|あそこ|あのこと)/;

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
  text = text
    .replace(/で気になったこと$/, "")
    .replace(/が気になったこと$/, "")
    .replace(/のこと$/, "")
    .trim();

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

function inferTopicType(label: string, text: string): TopicType {
  const known = knownTopicType(label);

  if (known) {
    return known;
  }

  if (
    /(さん|先生|先輩|後輩|友達|友人|家族|母|父|兄|姉|弟|妹|孫|息子|娘|同僚|近所の人|町内会の人|職員|店員|医師|医者)$/.test(
      label,
    )
  ) {
    return "person";
  }

  if (/(駅|店|病院|公園|学校|家|施設|会館|商店街|図書館|役所|職場|会社|庭|寺|神社|市場|会場)$/.test(label)) {
    return "place";
  }

  if (/(料理|ご飯|飯|弁当|寿司|ラーメン|そば|蕎麦|パン|魚|肉|野菜|果物|お茶|コーヒー|菓子|味)$/.test(label)) {
    return "food";
  }

  if (/(会|祭り|講座|趣味|ゲーム|音楽|散歩|買い物|旅行|読書|将棋|囲碁|俳句|カラオケ|運動|体操)$/.test(label)) {
    return "activity";
  }

  if (/(寂しい|さびしい|不安|心配|楽しい|うれしい|嬉しい|疲れた|怖い|こわい)/.test(label)) {
    return "feeling";
  }

  if (/(話した|聞いた|見た|読んだ|調べた|考えた|気になった)/.test(text)) {
    return "object";
  }

  return "object";
}

function topicTypeForPattern(label: string, fallback: TopicType) {
  if (fallback === "memory" || fallback === "person") {
    return fallback;
  }

  return knownTopicType(label) ?? fallback;
}

function eventTypeForInferredTopic(text: string): EventType {
  if (/話した|話してた|聞いた|聞きました|言われた|読んだ|調べた/.test(text)) {
    return "heard_about";
  }

  if (/見た|見ました|見かけた/.test(text)) {
    return "saw";
  }

  if (/作った|作りました|買った|買いました/.test(text)) {
    return "made";
  }

  if (/流行|トレンド|人気/.test(text)) {
    return "is_trending";
  }

  return "unknown";
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

function extractQuotedCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  const matches = text.matchAll(/[「『"]([^」』"]{1,32})[」』"]/g);

  for (const match of matches) {
    const rawLabel = match[1];
    const label = normalizeFocus(rawLabel);

    if (!isUsableFocus(label)) {
      continue;
    }

    mergeCandidate(candidates, {
      label,
      eventType: eventTypeForInferredTopic(text),
      relationHint: "引用された話題",
      topicType: inferTopicType(label, text),
      index: match.index ?? text.indexOf(rawLabel),
      score: 235,
      source: "inferred",
    });
  }
}

function extractTopicMarkerCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  const markerPatterns = [
    /(.{1,32}?)(?:について|のことで|の件で|の話題で)(?:考えた|考えていた|気になった|調べた|読んだ|見た|聞いた|話した|話してた|盛り上がった|でした|だった|です)?/,
    /(.{1,28}?)(?:を|に)(?:考えた|考えていた|調べた|読んだ|聞いた|見た)/,
    /(.{1,28}?)(?:が|は)(?:面白かった|おもしろかった|気になった|不思議だった|変だった|珍しかった|すごかった|新しかった|よかった|良かった)/,
    /(.{2,24}?)(?:でした|だった|だよ|だね|です)$/,
  ];

  for (const pattern of markerPatterns) {
    const match = pattern.exec(text);
    const rawFocus = match?.[1];

    if (!rawFocus) {
      continue;
    }

    const label = normalizeFocus(rawFocus);

    if (!isUsableFocus(label) || weakFocusStopWords.has(label)) {
      continue;
    }

    mergeCandidate(candidates, {
      label,
      eventType: eventTypeForInferredTopic(text),
      relationHint: "発話から推定した話題",
      topicType: inferTopicType(label, text),
      index: match.index + match[0].indexOf(rawFocus),
      score: 220,
      source: "inferred",
    });
  }
}

function extractLooseNounCandidates(text: string, candidates: Map<string, FocusCandidate>) {
  const matches = text.matchAll(/[一-龠々ァ-ヶーA-Za-z0-9]{2,24}/g);

  for (const match of matches) {
    const rawLabel = match[0];
    const label = normalizeFocus(rawLabel);

    if (
      !isUsableFocus(label) ||
      weakFocusStopWords.has(label) ||
      candidates.has(label)
    ) {
      continue;
    }

    const hasConcreteShape = /[一-龠々ァ-ヶーA-Za-z0-9]/.test(label);

    if (!hasConcreteShape) {
      continue;
    }

    mergeCandidate(candidates, {
      label,
      eventType: eventTypeForInferredTopic(text),
      relationHint: "発話内の具体語",
      topicType: inferTopicType(label, text),
      index: match.index ?? text.indexOf(rawLabel),
      score: 142,
      source: "inferred",
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
  extractQuotedCandidates(text, candidates);
  extractTopicMarkerCandidates(text, candidates);
  extractKatakanaCandidates(text, candidates);
  extractDictionaryCandidates(text, candidates);
  extractLooseNounCandidates(text, candidates);

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

function containsQuestion(text: string) {
  return /[？?]/.test(text);
}

function hasTwoRecentQuestions(assistantReplies: string[]) {
  const recent = assistantReplies.slice(-2);

  return recent.length === 2 && recent.every(containsQuestion);
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

export function isNoAnswer(text: string) {
  return includesAny(text, noAnswerTerms);
}

function requestsTopicChange(text: string) {
  return includesAny(text, topicChangeTerms);
}

function requestedPause(text: string) {
  return includesAny(text, pauseTerms);
}

function isLowEnergyStatement(text: string) {
  return includesAny(text, lowEnergyTerms);
}

function requestsSuggestion(text: string) {
  return includesAny(text, suggestionRequestTerms);
}

function rejectedPreviousProposal(text: string, recentMessages: StoredChatMessage[]) {
  if (!includesAny(text, proposalRejectionTerms)) return false;
  const lastAssistant = recentMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  return Boolean(lastAssistant && proposalPattern.test(lastAssistant.content));
}

function needsClarification(text: string, topCandidate: FocusCandidate | null) {
  return topCandidate === null && ambiguousReferencePattern.test(text);
}

function collectConversationSignals({
  userMessage,
  candidates,
  assistantReplies,
  recentMessages,
}: {
  userMessage: string;
  candidates: FocusCandidate[];
  assistantReplies: string[];
  recentMessages: StoredChatMessage[];
}): ConversationSignals {
  const recentQuestionCount = assistantReplies.slice(-2).filter(containsQuestion).length;
  const recentUserContext = recentMessages
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content)
    .join(" ");
  const groundedUserContext = `${recentUserContext} ${userMessage}`;
  const topicChangeRequested = requestsTopicChange(userMessage);
  return {
    shortReply: isShortAnswer(userMessage, candidates),
    recentQuestionCount,
    repeatedQuestions: assistantReplies.slice(-2).length === 2 && recentQuestionCount === 2,
    topicChangeRequested,
    topicChangeTargetProvided:
      topicChangeRequested && candidates.some(isConcreteCandidate),
    proposalRejected: rejectedPreviousProposal(userMessage, recentMessages),
    pauseRequested: requestedPause(userMessage) || isNoAnswer(userMessage),
    lowEnergyStatement: isLowEnergyStatement(userMessage),
    explicitFeeling: includesAny(userMessage, [
      ...lonelinessTerms,
      ...anxietyTerms,
      "悲しい",
      "つらい",
      "疲れた",
      "だるい",
      "しんどい",
    ]),
    suggestionRequested: requestsSuggestion(userMessage),
    weatherMentioned: /(?:天気|晴れ|雨|雪|曇り|暑い|寒い)/.test(groundedUserContext),
    photoMentioned: /(?:写真|画像)/.test(groundedUserContext),
  };
}

function chooseResponsePurpose({
  mode,
  topCandidate,
  signals,
}: {
  mode: ConversationMode;
  topCandidate: FocusCandidate | null;
  signals: ConversationSignals;
}): { responsePurpose: ResponsePurpose; questionPolicy: QuestionPolicy } {
  if (mode === "safety") {
    return { responsePurpose: "safety", questionPolicy: "required" };
  }
  if (signals.pauseRequested) {
    return { responsePurpose: "pause_or_close", questionPolicy: "avoid" };
  }
  if (signals.lowEnergyStatement) {
    return { responsePurpose: "clarify", questionPolicy: "required" };
  }
  if (signals.topicChangeRequested) {
    return {
      responsePurpose: "follow_preference",
      questionPolicy: signals.topicChangeTargetProvided ? "optional" : "required",
    };
  }
  if (signals.suggestionRequested) {
    return { responsePurpose: "follow_preference", questionPolicy: "optional" };
  }
  if (signals.proposalRejected || signals.repeatedQuestions || signals.shortReply) {
    return { responsePurpose: "receive", questionPolicy: "avoid" };
  }
  if (topCandidate) {
    return { responsePurpose: "continue_topic", questionPolicy: "optional" };
  }
  return { responsePurpose: "receive", questionPolicy: "optional" };
}

function chooseListeningStrategy({
  userMessage,
  mode,
  topCandidate,
  responsePurpose,
  questionPolicy,
}: {
  userMessage: string;
  mode: ConversationMode;
  topCandidate: FocusCandidate | null;
  responsePurpose: ResponsePurpose;
  questionPolicy: QuestionPolicy;
}): ListeningStrategy {
  if (requestsTopicChange(userMessage)) {
    return topCandidate ? "show_interest" : "ask_clarification";
  }

  if (responsePurpose === "pause_or_close") {
    return "allow_silence";
  }

  if (responsePurpose === "clarify" || needsClarification(userMessage, topCandidate)) {
    return "ask_clarification";
  }

  if (
    (mode === "loneliness" || mode === "anxiety") &&
    (!topCandidate || topCandidate.topicType === "feeling")
  ) {
    return "reflect_emotion";
  }

  if (topCandidate?.topicType === "feeling") {
    return "reflect_emotion";
  }

  if (questionPolicy === "required") {
    return "ask_open_question";
  }

  if (mode === "continuation" || mode === "reminiscence") {
    return "reflect_content";
  }

  if (topCandidate) {
    return "show_interest";
  }

  return "acknowledge";
}

export function normalizeConversationTurnPlan({
  plan,
  userMessage,
  recentAssistantReplies,
  hasConcreteTopic = plan.mainFocus !== null && plan.topicType !== "feeling",
}: {
  plan: ConversationTurnPlan;
  userMessage: string;
  recentAssistantReplies: string[];
  hasConcreteTopic?: boolean;
}): ConversationTurnPlan {
  const compactLength = userMessage.replace(/\s+/g, "").length;
  const noAnswer = isNoAnswer(userMessage);
  const shortWithoutTopic = !hasConcreteTopic && compactLength <= 12;
  const repeatedQuestions = hasTwoRecentQuestions(recentAssistantReplies);
  const needsTopicChoice =
    plan.conversationSignals.topicChangeRequested &&
    !plan.conversationSignals.topicChangeTargetProvided;
  let listeningStrategy = noAnswer ? "allow_silence" : plan.listeningStrategy;
  let responsePurpose = plan.responsePurpose;
  let questionPolicy = plan.questionPolicy;

  if (plan.mode === "safety") {
    responsePurpose = "safety";
  } else if (plan.conversationSignals.pauseRequested) {
    responsePurpose = "pause_or_close";
  } else if (plan.conversationSignals.lowEnergyStatement) {
    responsePurpose = "clarify";
  } else if (
    plan.conversationSignals.topicChangeRequested ||
    plan.conversationSignals.suggestionRequested
  ) {
    responsePurpose = "follow_preference";
  } else if (
    plan.conversationSignals.proposalRejected ||
    plan.conversationSignals.repeatedQuestions ||
    plan.conversationSignals.shortReply
  ) {
    responsePurpose = "receive";
  }

  if (
    responsePurpose === "safety" ||
    responsePurpose === "clarify" ||
    needsTopicChoice
  ) {
    questionPolicy = "required";
  } else if (
    responsePurpose === "pause_or_close" ||
    plan.conversationSignals.proposalRejected ||
    plan.conversationSignals.repeatedQuestions ||
    (plan.conversationSignals.shortReply && !plan.conversationSignals.lowEnergyStatement)
  ) {
    questionPolicy = "avoid";
  } else if (questionPolicy === "required") {
    questionPolicy = "optional";
  }

  if (needsTopicChoice) {
    listeningStrategy = "ask_clarification";
  } else if (
    plan.conversationSignals.topicChangeRequested &&
    plan.conversationSignals.topicChangeTargetProvided &&
    listeningStrategy === "change_topic"
  ) {
    listeningStrategy = plan.mainFocus ? "show_interest" : "acknowledge";
  }

  if (
    questionPolicy !== "required" &&
    (shortWithoutTopic || repeatedQuestions) &&
    (listeningStrategy === "ask_open_question" || listeningStrategy === "ask_clarification")
  ) {
    listeningStrategy =
      plan.mode === "loneliness" ||
      plan.mode === "anxiety" ||
      plan.topicType === "feeling"
        ? "reflect_emotion"
        : plan.mainFocus
          ? "show_interest"
          : "acknowledge";
  }

  const shouldAskQuestion = questionPolicy === "required";

  return {
    ...plan,
    responsePurpose,
    listeningStrategy,
    questionPolicy,
    shouldAskQuestion,
    suggestedQuestion: shouldAskQuestion ? (plan.suggestedQuestion ?? null) : null,
  };
}

function buildAvoidPatterns({
  mainFocus,
  questionPolicy,
  assistantReplies,
  signals,
}: {
  mainFocus: string | null;
  questionPolicy: QuestionPolicy;
  assistantReplies: string[];
  signals: ConversationSignals;
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
    "未観測の状態項目を埋めるために質問すること",
    "ATOMが利用者の次の行動や会話の継続を『〜しましょう』と決めること",
  ];

  if (mainFocus) {
    patterns.push(`「${mainFocus}」に触れずに返すこと`);
  }

  if (questionPolicy === "avoid") {
    patterns.push("質問や新しい提案で会話を押し進めること");
  }

  if (signals.proposalRejected) {
    patterns.push("直前に断られた提案を言い換えて繰り返すこと");
  }

  if (signals.topicChangeRequested && !signals.topicChangeTargetProvided) {
    patterns.push("ATOM側で次の話題を選んで提示すること");
  }

  if (!signals.explicitFeeling) {
    patterns.push("利用者が明言していない寂しさ・悲しさ・不安を断定すること");
  }

  if (!signals.suggestionRequested) {
    patterns.push("頼まれていない行動や連絡をすぐ提案すること");
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
  const conversationSignals = collectConversationSignals({
    userMessage,
    candidates,
    assistantReplies,
    recentMessages,
  });
  const purpose = chooseResponsePurpose({
    mode,
    topCandidate,
    signals: conversationSignals,
  });
  const mainFocus = topCandidate?.label ?? null;

  const plan: ConversationTurnPlan = {
    safetyLevel: safetyResult,
    mode,
    focusTerms: candidates.map((candidate) => candidate.label).slice(0, 5),
    mainFocus,
    eventType: topCandidate?.eventType ?? "unknown",
    relationHint: topCandidate?.relationHint ?? null,
    topicType: topCandidate?.topicType ?? "unknown",
    responsePurpose: purpose.responsePurpose,
    questionPolicy: purpose.questionPolicy,
    conversationSignals,
    listeningStrategy: chooseListeningStrategy({
      userMessage,
      mode,
      topCandidate,
      responsePurpose: purpose.responsePurpose,
      questionPolicy: purpose.questionPolicy,
    }),
    shouldAskQuestion: purpose.questionPolicy === "required",
    suggestedQuestion: null,
    avoidPatterns: buildAvoidPatterns({
      mainFocus,
      questionPolicy: purpose.questionPolicy,
      assistantReplies,
      signals: conversationSignals,
    }),
  };

  return normalizeConversationTurnPlan({
    plan,
    userMessage,
    recentAssistantReplies: assistantReplies,
    hasConcreteTopic: topCandidate !== null && isConcreteCandidate(topCandidate),
  });
}

export function getRecentAssistantReplies(messages: StoredChatMessage[]) {
  return messages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content);
}
