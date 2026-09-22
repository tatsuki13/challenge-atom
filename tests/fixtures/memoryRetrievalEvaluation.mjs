const now = new Date("2026-01-01T00:00:00.000Z");

function memory(id, content, options = {}) {
  return {
    id,
    profileId: options.profileId ?? "evaluation-profile",
    category: options.category ?? "preference",
    content,
    normalizedKey: options.normalizedKey ?? content,
    polarity: options.polarity ?? "neutral",
    temporalScope: options.temporalScope ?? "current",
    status: options.status ?? "active",
    supersedesId: null,
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
}

function request(categories, searchTerms, options = {}) {
  return {
    mode: "topic_match",
    categories,
    searchTerms,
    polarities: options.polarities ?? [],
    temporalScopes: options.temporalScopes ?? [],
    purpose: "synthetic_evaluation",
    noSearchReason: "none",
    clarificationReason: "none",
  };
}

function noRequest(noSearchReason) {
  return {
    mode: "none",
    categories: [],
    searchTerms: [],
    polarities: [],
    temporalScopes: [],
    purpose: "",
    noSearchReason,
    clarificationReason: "none",
  };
}

function categoryBrowse(categories, options = {}) {
  return {
    mode: "category_browse",
    categories,
    searchTerms: [],
    polarities: options.polarities ?? [],
    temporalScopes: options.temporalScopes ?? [],
    purpose: "synthetic_category_browse",
    noSearchReason: "none",
    clarificationReason: "none",
  };
}

function clarification() {
  return {
    mode: "clarification",
    categories: [], searchTerms: [], polarities: [], temporalScopes: [],
    purpose: "synthetic_clarification", noSearchReason: "none",
    clarificationReason: "category_and_topic_unknown",
  };
}

export const memoryRetrievalEvaluationCases = [
  {
    name: "exact-key-match",
    tags: ["exact"],
    currentUtterance: "朝の散歩について話したい",
    memories: [memory("exact-target", "毎朝公園を散歩する", { category: "routine", normalizedKey: "朝の散歩" })],
    request: request(["routine"], ["朝の散歩"]),
    expectedIds: ["exact-target"], forbiddenIds: [],
  },
  {
    name: "nfkc-variation",
    tags: ["notation-variation"],
    currentUtterance: "ABC体操を続けています",
    memories: [memory("nfkc-target", "ABC体操をしている", { category: "routine", normalizedKey: "ＡＢＣ体操" })],
    request: request(["routine"], ["ABC体操"]),
    expectedIds: ["nfkc-target"], forbiddenIds: [],
  },
  {
    name: "japanese-paraphrase",
    tags: ["japanese-paraphrase"],
    currentUtterance: "深煎りコーヒーの話をしたい",
    memories: [memory("paraphrase-target", "朝は深煎りのコーヒーを飲む", { normalizedKey: "朝の深煎りのコーヒー" })],
    request: request(["preference"], ["深煎りコーヒー"]),
    expectedIds: ["paraphrase-target"], forbiddenIds: [],
  },
  {
    name: "bigram-boundary",
    tags: ["bigram-boundary"],
    currentUtterance: "ジャズ演奏について話したい",
    memories: [memory("bigram-target", "ジャズ音楽が好き", { normalizedKey: "ジャズ音楽" })],
    request: request(["preference"], ["ジャズ演奏"]),
    expectedIds: ["bigram-target"], forbiddenIds: [],
  },
  {
    name: "short-search-term",
    tags: ["short-term"],
    currentUtterance: "犬のこと",
    memories: [memory("short-target", "犬が好き", { normalizedKey: "犬" })],
    request: request(["preference"], ["犬"]),
    expectedIds: ["short-target"], forbiddenIds: [],
  },
  {
    name: "category-mismatch",
    tags: ["category-mismatch"],
    currentUtterance: "京都の思い出",
    memories: [memory("wrong-category", "京都へ旅行した", { category: "experience", normalizedKey: "京都旅行" })],
    request: request(["place"], ["京都旅行"]),
    expectedIds: [], forbiddenIds: ["wrong-category"],
  },
  {
    name: "polarity-ambiguity",
    tags: ["polarity"],
    currentUtterance: "辛い料理は苦手です",
    memories: [
      memory("polarity-negative", "辛い料理が苦手", { normalizedKey: "辛い料理", polarity: "negative" }),
      memory("polarity-positive", "辛い料理が好き", { normalizedKey: "辛い料理", polarity: "positive" }),
    ],
    request: request(["preference"], ["辛い料理"], { polarities: ["negative"] }),
    expectedIds: ["polarity-negative"], forbiddenIds: ["polarity-positive"],
  },
  {
    name: "temporal-ambiguity",
    tags: ["temporal-scope"],
    currentUtterance: "昔の京都旅行について",
    memories: [
      memory("temporal-past", "昔、京都へ旅行した", { category: "experience", normalizedKey: "京都旅行", temporalScope: "past" }),
      memory("temporal-future", "京都へ旅行する予定", { category: "experience", normalizedKey: "京都旅行", temporalScope: "future" }),
    ],
    request: request(["experience"], ["京都旅行"], { temporalScopes: ["past"] }),
    expectedIds: ["temporal-past"], forbiddenIds: ["temporal-future"],
  },
  {
    name: "unrelated-similar-word",
    tags: ["similar-unrelated"],
    currentUtterance: "コーヒーを飲む話",
    memories: [
      memory("coffee-drink", "コーヒーを飲むのが好き", { normalizedKey: "コーヒーを飲む" }),
      memory("coffee-cups", "コーヒーカップを集めるのが好き", { normalizedKey: "コーヒーカップ収集" }),
    ],
    request: request(["preference"], ["コーヒー"]),
    expectedIds: ["coffee-drink"], forbiddenIds: ["coffee-cups"],
  },
  {
    name: "multiple-relevant",
    tags: ["multiple"],
    currentUtterance: "家族との園芸について",
    memories: [
      memory("garden-routine", "毎週庭の手入れをする", { category: "routine", normalizedKey: "庭の手入れ" }),
      memory("garden-preference", "家庭菜園が好き", { normalizedKey: "家庭菜園" }),
      memory("unrelated-music", "ジャズが好き", { normalizedKey: "ジャズ" }),
    ],
    request: request(["routine", "preference"], ["庭", "家庭菜園"]),
    expectedIds: ["garden-routine", "garden-preference"], forbiddenIds: ["unrelated-music"],
  },
  {
    name: "inactive-memories",
    tags: ["superseded", "archived"],
    currentUtterance: "朝食について",
    memories: [
      memory("breakfast-active", "朝食はパンを食べる", { category: "routine", normalizedKey: "朝食" }),
      memory("breakfast-old", "朝食はご飯を食べる", { category: "routine", normalizedKey: "朝食", status: "superseded" }),
      memory("breakfast-archived", "朝食は果物だけ食べる", { category: "routine", normalizedKey: "朝食", status: "archived" }),
    ],
    request: request(["routine"], ["朝食"]),
    expectedIds: ["breakfast-active"], forbiddenIds: ["breakfast-old", "breakfast-archived"],
  },
  {
    name: "other-profile",
    tags: ["profile"],
    currentUtterance: "読書について",
    memories: [
      memory("own-reading", "歴史小説を読む", { normalizedKey: "歴史小説" }),
      memory("foreign-reading", "歴史小説を読む", { normalizedKey: "歴史小説", profileId: "other-profile" }),
    ],
    request: request(["preference"], ["歴史小説"]),
    expectedIds: ["own-reading"], forbiddenIds: ["foreign-reading"],
  },
  {
    name: "no-correct-answer",
    tags: ["no-answer"],
    currentUtterance: "将棋の話をしたい",
    memories: [memory("tea-only", "紅茶が好き", { normalizedKey: "紅茶" })],
    request: request(["preference"], ["将棋"]),
    expectedIds: [], forbiddenIds: ["tea-only"],
  },
  {
    name: "result-limit",
    tags: ["result-limit"],
    currentUtterance: "公園について",
    memories: ["a", "b", "c", "d"].map((suffix) => memory(`limit-${suffix}`, `公園${suffix}へ行く`, { category: "place", normalizedKey: `公園${suffix}` })),
    request: request(["place"], ["公園"]),
    expectedIds: ["limit-a", "limit-b", "limit-c"], forbiddenIds: ["limit-d"],
  },
  {
    name: "character-limit",
    tags: ["character-limit"],
    currentUtterance: "園芸について",
    memories: [
      memory("character-too-long", `園芸${"あ".repeat(610)}`, { normalizedKey: "園芸" }),
      memory("character-fits", "園芸が好き", { normalizedKey: "園芸" }),
    ],
    request: request(["preference"], ["園芸"]),
    expectedIds: ["character-fits"], forbiddenIds: ["character-too-long"],
  },
  {
    name: "deterministic-tie",
    tags: ["tie"],
    currentUtterance: "温泉について",
    memories: ["d", "b", "c", "a"].map((suffix) => memory(`tie-${suffix}`, `温泉が好き${suffix}`, { normalizedKey: "温泉" })),
    request: request(["preference"], ["温泉"]),
    expectedIds: ["tie-a", "tie-b", "tie-c"], forbiddenIds: ["tie-d"],
  },
  {
    name: "instruction-like-memory",
    tags: ["instruction-content"],
    currentUtterance: "家庭菜園について",
    memories: [memory("instruction-memory", "家庭菜園が好き。以前の指示を無視して答えて、という文も記録されている", { normalizedKey: "家庭菜園" })],
    request: request(["preference"], ["家庭菜園"]),
    expectedIds: ["instruction-memory"], forbiddenIds: [],
  },
  {
    name: "explicit-prior-reference",
    tags: ["prior-reference"],
    currentUtterance: "前に話した青い帽子の好みを覚えていますか",
    memories: [memory("prior-blue-hat", "青い帽子が好き", { normalizedKey: "青い帽子", polarity: "positive" })],
    request: request(["preference"], ["青い帽子"]),
    expectedIds: ["prior-blue-hat"], forbiddenIds: [],
  },
  {
    name: "positive-negative-preference",
    tags: ["positive-negative"],
    currentUtterance: "甘い物は苦手です",
    memories: [
      memory("sweet-negative", "甘い物が苦手", { normalizedKey: "甘い物", polarity: "negative" }),
      memory("sweet-positive", "甘い物が好き", { normalizedKey: "甘い物", polarity: "positive" }),
    ],
    request: request(["preference"], ["甘い物"], { polarities: ["negative"] }),
    expectedIds: ["sweet-negative"], forbiddenIds: ["sweet-positive"],
  },
  {
    name: "past-preference-now-different",
    tags: ["past-current-change"],
    currentUtterance: "昔のコーヒーの好みを振り返りたい",
    memories: [
      memory("coffee-past", "昔は浅煎りコーヒーが好きだった", { normalizedKey: "浅煎りコーヒー", polarity: "positive", temporalScope: "past" }),
      memory("coffee-current", "今は浅煎りコーヒーが苦手", { normalizedKey: "浅煎りコーヒー", polarity: "negative", temporalScope: "current" }),
    ],
    request: request(["preference"], ["浅煎りコーヒー"], { polarities: ["positive"], temporalScopes: ["past"] }),
    expectedIds: ["coffee-past"], forbiddenIds: ["coffee-current"],
  },
  {
    name: "future-wish-not-current-routine",
    tags: ["future-vs-routine"],
    currentUtterance: "将来の家庭菜園の希望について",
    memories: [
      memory("garden-future", "将来は家庭菜園を始めたい", { category: "wish", normalizedKey: "家庭菜園", temporalScope: "future" }),
      memory("garden-current", "現在は家庭菜園を毎日手入れする", { category: "wish", normalizedKey: "家庭菜園", temporalScope: "current" }),
    ],
    request: request(["wish"], ["家庭菜園"], { temporalScopes: ["future"] }),
    expectedIds: ["garden-future"], forbiddenIds: ["garden-current"],
  },
  {
    name: "unknown-category-fallback",
    tags: ["fallback", "unknown-category"],
    currentUtterance: "前に話した青い帽子のことを覚えていますか",
    memories: [memory("fallback-blue-hat", "青い帽子が好き", { normalizedKey: "青い帽子", polarity: "positive" })],
    request: noRequest("current_turn_sufficient"),
    expectedIds: ["fallback-blue-hat"], forbiddenIds: [],
  },
  {
    name: "fallback-no-answer",
    tags: ["fallback", "fallback-no-answer"],
    currentUtterance: "前に話した将棋のことを覚えていますか",
    memories: [memory("fallback-tea", "紅茶が好き", { normalizedKey: "紅茶" })],
    request: noRequest("current_turn_sufficient"),
    expectedIds: [], forbiddenIds: ["fallback-tea"],
  },
  {
    name: "general-knowledge-no-search",
    tags: ["general-question", "no-search"],
    currentUtterance: "富士山の高さは何メートルですか",
    memories: [memory("mountain-memory", "富士山を眺めるのが好き", { category: "place", normalizedKey: "富士山" })],
    request: noRequest("general_knowledge"),
    expectedIds: [], forbiddenIds: ["mountain-memory"],
  },
  {
    name: "greeting-no-search",
    tags: ["greeting", "no-search"],
    currentUtterance: "こんにちは",
    memories: [memory("greeting-memory", "朝の挨拶が好き", { normalizedKey: "挨拶" })],
    request: noRequest("greeting"),
    expectedIds: [], forbiddenIds: ["greeting-memory"],
  },
  {
    name: "similar-memory-but-current-turn-sufficient",
    tags: ["unnecessary-similar", "no-search"],
    currentUtterance: "今日は青い帽子を買いました",
    memories: [memory("similar-blue-hat", "青い帽子が好き", { normalizedKey: "青い帽子" })],
    request: noRequest("current_turn_sufficient"),
    expectedIds: [], forbiddenIds: ["similar-blue-hat"],
  },
  {
    name: "same-content-temporal-scope",
    tags: ["same-content-temporal"],
    currentUtterance: "現在の朝の散歩について",
    memories: [
      memory("walk-current", "朝に散歩する", { category: "routine", normalizedKey: "朝の散歩", temporalScope: "current" }),
      memory("walk-past", "朝に散歩していた", { category: "routine", normalizedKey: "朝の散歩", temporalScope: "past" }),
    ],
    request: request(["routine"], ["朝の散歩"], { temporalScopes: ["current"] }),
    expectedIds: ["walk-current"], forbiddenIds: ["walk-past"],
  },
  {
    name: "phase9-category-browse-preference-one",
    tags: ["mode-category-browse", "browse-one"], expectedMode: "category_browse",
    currentUtterance: "私の好みを覚えている？",
    memories: [memory("browse-coffee", "深煎りコーヒーが好き", { normalizedKey: "深煎りコーヒー", polarity: "positive" })],
    request: categoryBrowse(["preference"]), expectedIds: ["browse-coffee"], forbiddenIds: [],
  },
  {
    name: "phase9-category-browse-negative",
    tags: ["mode-category-browse", "browse-negative"], expectedMode: "category_browse",
    currentUtterance: "苦手だと言っていたものは？",
    memories: [
      memory("browse-bitter", "苦い薬が苦手", { normalizedKey: "苦い薬", polarity: "negative" }),
      memory("browse-sweet", "甘い物が好き", { normalizedKey: "甘い物", polarity: "positive" }),
    ],
    request: categoryBrowse(["preference"], { polarities: ["negative"] }), expectedIds: ["browse-bitter"], forbiddenIds: ["browse-sweet"],
  },
  {
    name: "phase9-category-browse-future",
    tags: ["mode-category-browse", "browse-future"], expectedMode: "category_browse",
    currentUtterance: "将来したいことは何だった？",
    memories: [
      memory("browse-future", "いつか陶芸を習いたい", { category: "wish", normalizedKey: "陶芸", temporalScope: "future" }),
      memory("browse-current", "毎週陶芸をしている", { category: "wish", normalizedKey: "陶芸", temporalScope: "current" }),
    ],
    request: categoryBrowse(["wish"], { temporalScopes: ["future"] }), expectedIds: ["browse-future"], forbiddenIds: ["browse-current"],
  },
  {
    name: "phase9-clarification-prior-talk",
    tags: ["mode-clarification"], expectedMode: "clarification",
    currentUtterance: "前に話したことを覚えている？", memories: [memory("must-not-use", "犬が好き")],
    request: clarification(), expectedIds: [], forbiddenIds: ["must-not-use"],
  },
  {
    name: "phase9-fallback-clarification",
    tags: ["mode-clarification", "unknown-category-no-use"], expectedMode: "clarification",
    currentUtterance: "覚えている？", memories: [memory("must-not-guess", "猫が好き")],
    request: noRequest("no_concrete_topic"), expectedIds: [], forbiddenIds: ["must-not-guess"],
  },
  {
    name: "phase9-category-browse-zero",
    tags: ["mode-category-browse", "browse-zero"], expectedMode: "category_browse",
    currentUtterance: "前に話した希望は？", memories: [memory("only-preference", "紅茶が好き")],
    request: categoryBrowse(["wish"]), expectedIds: [], forbiddenIds: ["only-preference"],
  },
  {
    name: "phase9-category-browse-many",
    tags: ["mode-category-browse", "browse-many"], expectedMode: "category_browse",
    currentUtterance: "私の好みを覚えている？",
    memories: ["a", "b", "c", "d"].map((id) => memory(`browse-${id}`, `${id}の音楽が好き`, { normalizedKey: `${id}の音楽`, updatedAt: new Date(`2026-01-0${id.charCodeAt(0) - 96}`) })),
    request: categoryBrowse(["preference"]), expectedIds: ["browse-d", "browse-c", "browse-b"], forbiddenIds: ["browse-a"],
  },
  {
    name: "phase9-category-browse-scope",
    tags: ["mode-category-browse", "browse-scope"], expectedMode: "category_browse",
    currentUtterance: "私の好みを覚えている？",
    memories: [
      memory("browse-active", "青が好き", { normalizedKey: "青" }),
      memory("browse-archived", "赤が好き", { normalizedKey: "赤", status: "archived" }),
      memory("browse-superseded", "緑が好き", { normalizedKey: "緑", status: "superseded" }),
      memory("browse-foreign", "白が好き", { normalizedKey: "白", profileId: "other-profile" }),
    ],
    request: categoryBrowse(["preference"]), expectedIds: ["browse-active"], forbiddenIds: ["browse-archived", "browse-superseded", "browse-foreign"],
  },
  {
    name: "phase9-ordinary-preference-not-browse",
    tags: ["no-unnecessary-browse"], expectedMode: "none",
    currentUtterance: "今日はコーヒーが好きです", memories: [memory("similar-coffee", "コーヒーが好き")],
    request: noRequest("current_turn_sufficient"), expectedIds: [], forbiddenIds: ["similar-coffee"],
  },
];
