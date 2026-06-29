import type {
  EmotionLabel,
  RiskLevel,
  StoredChatMessage,
} from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";

const keywordReplies: Array<{ terms: string[]; replies: string[] }> = [
  {
    terms: ["カレー"],
    replies: [
      "カレーだったんですね。家のカレーって、ちょっと安心する味がありますよね。どんな具が入っていました？",
      "いいですね、カレー。あの香りだけで少しお腹がすいてきますね。辛さはどのくらいでした？",
    ],
  },
  {
    terms: ["スーパー", "買い物"],
    replies: [
      "スーパーまで行かれたんですね。売り場って、季節のものが少しずつ変わりますよね。何か目に留まったものはありました？",
      "買い物に行かれたんですね。外に出るだけでも、少し気分が変わることがありますね。",
    ],
  },
  {
    terms: ["話した", "話して", "電話", "会った", "会えて", "おしゃべり"],
    replies: [
      "そうなんですね。どんな話をしたんですか？",
      "それはよかったですね。話していて、印象に残ったことはありました？",
      "誰かと話す時間があったんですね。その時はどんな雰囲気でした？",
    ],
  },
  {
    terms: ["畑"],
    replies: [
      "畑をされていたんですね。土を触る時間って、季節をよく感じられそうです。何を育てるのが好きでしたか？",
      "畑の話、いいですね。育っていく様子を見るのは楽しみだったでしょうね。",
    ],
  },
  {
    terms: ["昔", "若いころ", "若い頃", "思い出", "懐かしい"],
    replies: [
      "その頃の話、いいですね。聞いていると、少し景色が浮かんできます。どんな場所が思い浮かびますか？",
      "懐かしい話ですね。そういう思い出って、ふとした時に戻ってきますね。",
    ],
  },
  {
    terms: ["誰とも話してない", "誰とも話していない", "誰にも会わない"],
    replies: [
      "今日は人の声が少ない一日だったんですね。そういう日は、時間がゆっくり過ぎる感じがありますね。",
      "そうでしたか。人と話さない時間が続くと、部屋の静けさがいつもより大きく感じることがありますね。",
    ],
  },
];

const emotionReplies: Record<EmotionLabel, string[]> = {
  lonely: [
    "そうでしたか。今日は少し寂しさがそばにある感じだったんですね。どの時間が一番長く感じました？",
    "うん、ひとりの時間が長く感じる日もありますね。今は少し落ち着いていますか？",
  ],
  sad: [
    "少し大変だったんですね。今日はその感じが残っているのかもしれませんね。何が一番こたえました？",
    "うん、しんどさがある日だったんですね。無理に明るくしなくても、そのまま話して大丈夫です。",
  ],
  anxious: [
    "それは気になりますね。今いちばん引っかかっているのは、どのあたりですか？",
    "なるほど、少し落ち着かない感じがあるんですね。いつ頃から気になっていました？",
  ],
  positive: [
    "へえ、いいですね。そういう話を聞くと、こちらも少し明るくなります。何が一番よかったですか？",
    "それはよかったですね。小さくても、そういう時間があるとうれしいですね。",
  ],
  reminiscence: [
    "その頃のことが浮かんだんですね。そういう話、もう少し聞きたくなります。",
    "懐かしいですね。その時の空気まで少し思い出しそうです。どんな場面でした？",
  ],
  neutral: [
    "そうなんですね。どんなことがありました？",
    "なるほど。そういう一日だったんですね。少し印象に残っていることはありますか？",
    "うん、そうだったんですね。その時はどんな感じでした？",
  ],
};

function getRecentOpeners(recentMessages: StoredChatMessage[]) {
  return recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content.slice(0, 6));
}

function pickReply(replies: string[], recentMessages: StoredChatMessage[]) {
  const recentOpeners = getRecentOpeners(recentMessages);
  const filtered = replies.filter(
    (reply) => !recentOpeners.some((opener) => reply.startsWith(opener)),
  );
  const candidates = filtered.length > 0 ? filtered : replies;

  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
}

export function createMockReply({
  message,
  emotionLabel,
  riskLevel,
  recentMessages = [],
}: {
  message: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  recentMessages?: StoredChatMessage[];
}) {
  if (riskLevel === "urgent") {
    return getUrgentSafetyReply();
  }

  const keywordReply = keywordReplies.find((item) =>
    item.terms.some((term) => message.includes(term)),
  );

  return pickReply(
    keywordReply?.replies ?? emotionReplies[emotionLabel],
    recentMessages,
  );
}
