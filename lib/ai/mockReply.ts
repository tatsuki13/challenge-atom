import type { StoredChatMessage } from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";
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

const goalReplies: Record<ConversationTurnPlan["responseGoal"], ReplySet> = {
  react: {
    chat: [
      "へえ、そうなんですね。そこから話が広がりそうで、少し面白いですね。",
      "なるほど。そういう話題って、聞いているとその場の様子が浮かんできますね。",
    ],
    ask: [],
  },
  chat: {
    chat: [
      "そうなんですね。何気ない話でも、その日の感じが少し出ますね。",
      "なるほど。そういう出来事があると、一日の手触りが少し残りますね。",
    ],
    ask: [
      "そうなんですね。何の話で盛り上がったんですか？",
    ],
  },
  continue: {
    chat: [
      "その話、もう少し聞きたいです。",
      "それで、それで。続きも聞かせてください。",
    ],
    ask: [],
  },
  ask: {
    chat: [
      "そうなんですね。今日はそんな流れだったんですね。",
    ],
    ask: [
      "そうなんですね。何の話で盛り上がったんですか？",
    ],
  },
  reminisce: {
    chat: [
      "懐かしい話ですね。その頃の空気まで少し思い出しそうです。",
    ],
    ask: [
      "懐かしい話ですね。その頃は何が楽しみでしたか？",
    ],
  },
  empathize: {
    chat: [
      "そうでしたか。その感じが今日は少し残っているんですね。",
      "うん、そういう日もありますね。無理に明るくしなくても、そのまま話して大丈夫です。",
    ],
    ask: [
      "そうでしたか。今いちばん気になっているのは、どのあたりですか？",
    ],
  },
  safety: {
    chat: [getUrgentSafetyReply()],
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

function buildGenericFocusReply(focus: string, userMessage: string) {
  if (userMessage.includes("トレンド") || userMessage.includes("流行")) {
    return {
      chat: [
        `${focus}が話題なんですね。昔からあるものでも、見方が変わると新しく感じますね。`,
      ],
      ask: [
        `${focus}が話題なんですね。どんなところが人気なんでしょう？`,
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
}: {
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  recentMessages?: StoredChatMessage[];
}) {
  if (turnPlan.safetyLevel === "urgent") {
    return getUrgentSafetyReply();
  }

  const focusReply =
    turnPlan.mainFocus !== null
      ? focusReplies[turnPlan.mainFocus] ??
        buildGenericFocusReply(turnPlan.mainFocus, userMessage)
      : null;
  const fallbackReply = goalReplies[turnPlan.responseGoal] ?? goalReplies.chat;
  const replySet = focusReply ?? fallbackReply;
  const replies =
    turnPlan.shouldAskQuestion && replySet.ask.length > 0
      ? replySet.ask
      : replySet.chat;

  return pickReply({
    replies,
    recentMessages,
    shouldAskQuestion: turnPlan.shouldAskQuestion,
  });
}
