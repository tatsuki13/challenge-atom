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
      "カレーだったんですね。家のカレーって、ちょっと安心する味がありますよね。",
      "いいですね、カレー。あの香りだけで少しお腹がすいてきますね。",
    ],
  },
  {
    terms: ["スーパー", "買い物"],
    replies: [
      "スーパーまで行かれたんですね。売り場って、季節のものが少しずつ変わりますよね。",
      "買い物に行かれたんですね。外に出るだけでも、少し気分が変わることがありますね。",
    ],
  },
  {
    terms: ["畑"],
    replies: [
      "畑をされていたんですね。土を触る時間って、季節をよく感じられそうです。",
      "畑の話、いいですね。育っていく様子を見るのは楽しみだったでしょうね。",
    ],
  },
  {
    terms: ["昔", "若いころ", "若い頃", "思い出", "懐かしい"],
    replies: [
      "その頃の話、いいですね。聞いていると、少し景色が浮かんできます。",
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
    "そうでしたか。今日は少し寂しさがそばにある感じだったんですね。",
    "うん、ひとりの時間が長く感じる日もありますね。",
  ],
  sad: [
    "少し大変だったんですね。今日はその感じが残っているのかもしれませんね。",
    "うん、しんどさがある日だったんですね。ここではゆっくり話せます。",
  ],
  anxious: [
    "それは気になりますね。急いで答えを出さなくても大丈夫です。",
    "なるほど、少し落ち着かない感じがあるんですね。",
  ],
  positive: [
    "へえ、いいですね。そういう話を聞くと、こちらも少し明るくなります。",
    "それはよかったですね。小さくても、そういう時間があるとうれしいですね。",
  ],
  reminiscence: [
    "その頃のことが浮かんだんですね。そういう話、もう少し聞いていたくなります。",
    "懐かしいですね。その時の空気まで少し思い出しそうです。",
  ],
  neutral: [
    "そうなんですね。聞いています。",
    "なるほど。そういう一日だったんですね。",
    "うん、ゆっくりで大丈夫です。",
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
