import type { MemoryPromptContext, MemoryRetrievalMode, StoredChatMessage } from "../conversationTypes";
import { getReplyContract, hasContinuationCue } from "./replyValidation";
import type { ConversationTurnPlan } from "./conversationEngine";

type ReplySet = {
  chat: string[];
  ask: string[];
};

const focusReplies: Record<string, ReplySet> = {
  先生: {
    chat: [
      "先生とたくさん話されたんですね。話せる相手がいる時間って、少し気持ちがほどけますね。",
      "先生との話だったんですね。たくさん話せたなら、少しすっきりした時間だったのかもしれませんね。",
    ],
    ask: [
      "先生とたくさん話されたんですね。何の話で盛り上がったんですか？",
      "先生と話せたんですね。どんな話がいちばん弾みました？",
    ],
  },
  先輩: {
    chat: [
      "先輩とおしゃべりされたんですね。気軽に話せる相手がいる時間って、いいものですね。",
      "先輩とのおしゃべりだったんですね。少し話が弾んだ感じがしますね。",
    ],
    ask: [
      "先輩とおしゃべりされたんですね。何の話で盛り上がったんですか？",
      "先輩と話せたんですね。どんな話が出たんですか？",
    ],
  },
  蔵: {
    chat: [
      "蔵なんですか。面白いですね。昔ながらの雰囲気が、今はかえって新しく見えるのかもしれませんね。",
      "へえ、蔵がトレンドなんですね。古民家みたいな落ち着きが、今の暮らしに合うのかもしれませんね。",
    ],
    ask: [
      "蔵なんですか。面白いですね。古民家みたいな雰囲気なんですか？",
      "蔵がトレンドなんですね。どんなところが人気なんでしょう？",
    ],
  },
  ハウジング: {
    chat: [
      "ハウジングの話だったんですね。住まいの話って、流行が出ると急に面白くなりますね。",
      "ハウジングの話、いいですね。暮らし方の好みが少し見えてくる話題ですね。",
    ],
    ask: [
      "ハウジングの話だったんですね。どんな住まい方が話題になっていました？",
    ],
  },
  トレンド: {
    chat: [
      "トレンドの話だったんですね。昔ながらのものが、今は新しく見えることがありますね。",
      "流行って不思議ですね。少し前のものが、また別の形で人気になることがありますね。",
    ],
    ask: [
      "トレンドの話だったんですね。どんなところが新しいと言われていました？",
    ],
  },
  カレー: {
    chat: [
      "カレーだったんですね。家のカレーって、ちょっと安心する味がありますよね。",
      "いいですね、カレー。あの香りだけで少しお腹がすいてきますね。",
    ],
    ask: [
      "カレーだったんですね。どんなカレーでした？",
      "いいですね、カレー。具は何が入っていました？",
    ],
  },
  畑: {
    chat: [
      "畑をされていたんですね。土や季節の感じまで、思い出に残っていそうです。",
      "畑の話、いいですね。育っていく様子を見るのは楽しみだったでしょうね。",
    ],
    ask: [
      "畑をされていたんですね。その畑では、何を育てるのが好きでしたか？",
      "畑の話、いいですね。季節ごとに楽しみだったものはありました？",
    ],
  },
  スーパー: {
    chat: [
      "スーパーまで行かれたんですね。売り場って、季節のものが少しずつ変わりますよね。",
    ],
    ask: [
      "スーパーまで行かれたんですね。何か目に留まったものはありました？",
    ],
  },
  買い物: {
    chat: [
      "買い物に行かれたんですね。外に出るだけでも、少し気分が変わることがありますね。",
    ],
    ask: [
      "買い物に行かれたんですね。何を見て回ったんですか？",
    ],
  },
  散歩: {
    chat: [
      "散歩されたんですね。外の空気を感じるだけでも、一日の感じが少し変わりますね。",
    ],
    ask: [
      "散歩されたんですね。道の途中で何か目に入りました？",
    ],
  },
  電話: {
    chat: [
      "電話で話されたんですね。声を聞くと、文字だけより近く感じることがありますね。",
    ],
    ask: [
      "電話で話されたんですね。何の話で盛り上がったんですか？",
    ],
  },
  おしゃべり: {
    chat: [
      "おしゃべりできたんですね。誰かと話す時間があると、一日の感じが少し変わりますね。",
      "おしゃべりの時間があったんですね。そういう何気ない会話って、あとから少し残りますね。",
    ],
    ask: [
      "おしゃべりできたんですね。何の話で盛り上がったんですか？",
    ],
  },
  楽しい: {
    chat: [
      "いい時間だったみたいですね。その楽しさが少し残っている感じ、いいですね。",
      "楽しかったんですね。そういう時間があると、一日が少し明るくなりますね。",
    ],
    ask: [
      "楽しかったんですね。どのあたりが一番よかったですか？",
    ],
  },
  寂しい: {
    chat: [
      "今日は少し寂しさがそばにあったんですね。そういう日は、時間がゆっくり進む感じがありますね。",
    ],
    ask: [
      "今日は少し寂しさがそばにあったんですね。どの時間が一番長く感じました？",
    ],
  },
  不安: {
    chat: [
      "それは気になりますね。急いで答えを出さずに、まず少し落ち着いて話せるといいですね。",
    ],
    ask: [
      "それは気になりますね。今いちばん引っかかっているのは、どのあたりですか？",
    ],
  },
  疲れた: {
    chat: [
      "今日は少し頑張りすぎた一日だったのかもしれませんね。今は少し休めるといいですね。",
    ],
    ask: [
      "今日は少し頑張りすぎた一日だったのかもしれませんね。何が一番こたえました？",
    ],
  },
};

const strategyReplies: Record<ConversationTurnPlan["listeningStrategy"], ReplySet> = {
  acknowledge: {
    chat: [
      "そうなんですね。お話ししてくださって、ありがとうございます。",
      "なるほど。今のお話、受け取りました。",
    ],
    ask: [],
  },
  reflect_content: {
    chat: [
      "そういうことがあったんですね。今のお話の様子が少し伝わってきました。",
      "今日はそんな流れだったんですね。ゆっくり聞いています。",
    ],
    ask: [],
  },
  reflect_emotion: {
    chat: [
      "そうでしたか。その感じが今日は少し残っているんですね。",
      "うん、そういう時もありますね。無理に気持ちを変えなくて大丈夫です。",
    ],
    ask: [],
  },
  show_interest: {
    chat: [
      "へえ、そうなんですね。そのお話、少し気になります。",
      "なるほど。聞いていると、その場の様子が少し浮かびますね。",
    ],
    ask: [],
  },
  ask_open_question: {
    chat: [
      "そうなんですね。今のお話、もう少し聞いてみたいです。",
    ],
    ask: [
      "そうなんですね。そのことを、もう少し聞かせてもらえますか？",
    ],
  },
  ask_clarification: {
    chat: [
      "今のお話を、もう少し確かめてもよさそうですね。",
    ],
    ask: [
      "それは、どのことを指していますか？",
    ],
  },
  allow_silence: {
    chat: [
      "そうですよね。今は無理に話さなくても大丈夫です。",
      "分かりました。ここで少しゆっくりしていて大丈夫ですよ。",
    ],
    ask: [],
  },
  change_topic: {
    chat: [
      "では、少し話題を変えてみましょう。最近目に留まったものの話はいかがでしょう。",
      "それでは別のお話にしましょう。季節のことで思い浮かぶものを一つ置いておきますね。",
    ],
    ask: [],
  },
};

function getRecentOpeners(recentMessages: StoredChatMessage[]) {
  return recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content.slice(0, 8));
}

function hasQuestion(text: string) {
  return /[？?]/.test(text);
}

function pickReply({
  replies,
  recentMessages,
  shouldAskQuestion,
}: {
  replies: string[];
  recentMessages: StoredChatMessage[];
  shouldAskQuestion: boolean;
}) {
  const recentOpeners = getRecentOpeners(recentMessages);
  const questionFiltered = shouldAskQuestion
    ? replies
    : replies.filter((reply) => !hasQuestion(reply));
  const openerFiltered = questionFiltered.filter(
    (reply) => !recentOpeners.some((opener) => reply.startsWith(opener)),
  );
  const candidates =
    openerFiltered.length > 0
      ? openerFiltered
      : questionFiltered.length > 0
        ? questionFiltered
        : replies;

  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
}

function buildGenericFocusReply({
  focus,
  userMessage,
  turnPlan,
}: {
  focus: string;
  userMessage: string;
  turnPlan: ConversationTurnPlan;
}) {
  if (turnPlan.eventType === "talked_with" && turnPlan.topicType === "person") {
    return {
      chat: [
        `${focus}とおしゃべりできたんですね。いい時間だったんですね。`,
        `${focus}と話されたんですね。誰かと話す時間があると、一日の感じが少し変わりますね。`,
      ],
      ask: [
        `${focus}とおしゃべりできたんですね。何の話で盛り上がったんですか？`,
        `${focus}と話されたんですね。どんな話が出たんですか？`,
      ],
    };
  }

  if (turnPlan.eventType === "met" && turnPlan.topicType === "person") {
    return {
      chat: [
        `${focus}に会えたんですね。顔を合わせて話せる時間って、少し残りますね。`,
      ],
      ask: [
        `${focus}に会えたんですね。どんな話をされたんですか？`,
      ],
    };
  }

  if (turnPlan.eventType === "went_to" && turnPlan.topicType === "place") {
    return {
      chat: [
        `${focus}に行かれたんですね。外に出るだけでも、一日の感じが少し変わりますね。`,
      ],
      ask: [
        `${focus}に行かれたんですね。何か目に留まったものはありました？`,
      ],
    };
  }

  if (turnPlan.eventType === "ate" && turnPlan.topicType === "food") {
    return {
      chat: [
        `${focus}だったんですね。食べ慣れたものでも、その日の楽しみになりますね。`,
        `${focus}はいいですね。ほっとする味だったのかもしれませんね。`,
      ],
      ask: [
        `${focus}だったんですね。どんな味でした？`,
      ],
    };
  }

  if (turnPlan.eventType === "made") {
    return {
      chat: [
        `${focus}を用意されたんですね。手を動かして何かを作る時間って、少し集中できますね。`,
      ],
      ask: [
        `${focus}を作られたんですね。どんなふうに仕上がりました？`,
      ],
    };
  }

  if (turnPlan.eventType === "remembered") {
    return {
      chat: [
        `${focus}のことを思い出されたんですね。昔の時間が少し戻ってくるような話ですね。`,
        `${focus}の話、いいですね。その頃の空気まで少し浮かんできそうです。`,
      ],
      ask: [
        `${focus}の話、いいですね。その頃はどんな楽しみがありました？`,
      ],
    };
  }

  if (turnPlan.eventType === "is_trending" || userMessage.includes("トレンド") || userMessage.includes("流行")) {
    return {
      chat: [
        `${focus}が話題なんですね。昔からあるものでも、見方が変わると新しく感じますね。`,
      ],
      ask: [
        `${focus}が話題なんですね。どんなところが人気なんでしょう？`,
      ],
    };
  }

  if (turnPlan.eventType === "unknown") {
    if (turnPlan.topicType === "person") {
      return {
        chat: [
          `${focus}のことなんですね。身近な人の話は、少ししただけでも心に残りますね。`,
          `${focus}の話が出たんですね。誰かのことを思い浮かべるだけで、その場の空気が少し変わりますね。`,
        ],
        ask: [
          `${focus}のことなんですね。どんな話で出てきたんですか？`,
        ],
      };
    }

    if (turnPlan.topicType === "place") {
      return {
        chat: [
          `${focus}の話なんですね。その場所の空気まで少し浮かびそうです。`,
          `${focus}なんですね。場所の話って、行った時の景色まで一緒に出てきますね。`,
        ],
        ask: [
          `${focus}の話なんですね。そこはどんな雰囲気のところですか？`,
        ],
      };
    }

    if (turnPlan.topicType === "food") {
      return {
        chat: [
          `${focus}なんですね。食べ物の話って、それだけで少し場がやわらぎますね。`,
          `${focus}の話だったんですね。味や香りまで思い浮かびそうです。`,
        ],
        ask: [
          `${focus}なんですね。どんな味のものなんですか？`,
        ],
      };
    }

    if (turnPlan.topicType === "activity") {
      return {
        chat: [
          `${focus}の話なんですね。そういう話題は、聞いているだけでも少し動きが出ますね。`,
          `${focus}なんですね。普段の話と少し違う話題が出ると、面白くなりますね。`,
        ],
        ask: [
          `${focus}の話なんですね。どんなところが面白かったんですか？`,
        ],
      };
    }

    return {
      chat: [
        `${focus}なんですね。初めて聞くような話題でも、その言葉が出てくると少し気になりますね。`,
        `${focus}の話だったんですね。普段あまり出ない話題ほど、妙に残ることがありますね。`,
      ],
      ask: [
        `${focus}の話だったんですね。どんなところでその話になったんですか？`,
      ],
    };
  }

  return {
    chat: [
      `${focus}なんですね。そこに話が向くの、少し面白いですね。`,
      `${focus}の話だったんですね。聞いていると、その場の様子が少し浮かびます。`,
    ],
    ask: [
      `${focus}の話だったんですね。どんなところで盛り上がったんですか？`,
    ],
  };
}

export function createMockReply({
  userMessage,
  turnPlan,
  recentMessages = [],
  topicStarter = false,
  topicTitle = null,
  memoryMode = "none",
  memories = [],
  memorySelectionRequired = false,
}: {
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  recentMessages?: StoredChatMessage[];
  topicStarter?: boolean;
  topicTitle?: string | null;
  memoryMode?: MemoryRetrievalMode;
  memories?: MemoryPromptContext[];
  memorySelectionRequired?: boolean;
}) {
  const replyContract = getReplyContract(
    memoryMode,
    memorySelectionRequired,
    turnPlan.listeningStrategy,
  );
  const finish = (text: string) =>
    replyContract.requiresContinuationCue && !hasContinuationCue(text)
      ? `${text} 続きがあれば、ゆっくり聞かせてください。`
      : text;

  if (replyContract.memoryRole === "clarification") {
    return finish("以前のお話のうち、好み・これまでの経験・これからしたいことの、どれについて確認したいですか？");
  }

  if (replyContract.memoryRole === "candidate_presentation" && memories.length > 0) {
    const items = memories.map((memory) => `「${memory.content}」`).join("、");
    return finish(replyContract.requiresClarificationIntent
      ? `${items}について記憶しています。どのことを確認したいですか？`
      : `${items}についてお話ししていました。`);
  }

  if (replyContract.memoryRole === "candidate_presentation") {
    return finish("確認できる内容をまだ見つけられませんでした。もう少し具体的な話題を教えてもらえますか？");
  }

  if (topicStarter && topicTitle) {
    return finish(turnPlan.shouldAskQuestion
      ? `それでは今回は「${topicTitle}」でお話ししましょう。まず、そのことでぱっと思い浮かぶことはありますか？`
      : `それでは今回は「${topicTitle}」のお話にしましょう。思い浮かぶことがあれば、いつでも聞かせてください。`);
  }

  if (turnPlan.shouldAskQuestion && turnPlan.suggestedQuestion) {
    const opener = turnPlan.mainFocus
      ? `${turnPlan.mainFocus}の話なんですね。`
      : "";

    return finish(`${opener}${turnPlan.suggestedQuestion}`);
  }

  const canUseFocus =
    turnPlan.listeningStrategy === "reflect_content" ||
    turnPlan.listeningStrategy === "reflect_emotion" ||
    turnPlan.listeningStrategy === "show_interest" ||
    turnPlan.listeningStrategy === "ask_open_question";
  const focusReply =
    canUseFocus && turnPlan.mainFocus !== null
      ? focusReplies[turnPlan.mainFocus] ??
        buildGenericFocusReply({
          focus: turnPlan.mainFocus,
          userMessage,
          turnPlan,
        })
      : null;
  const fallbackReply = strategyReplies[turnPlan.listeningStrategy];
  const replySet = focusReply ?? fallbackReply;
  const replies =
    turnPlan.shouldAskQuestion && replySet.ask.length > 0
      ? replySet.ask
      : replySet.chat;

  return finish(pickReply({
    replies,
    recentMessages,
    shouldAskQuestion: turnPlan.shouldAskQuestion,
  }));
}
