import type {
  EmotionLabel,
  RiskLevel,
  StoredChatMessage,
} from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";
import type { ConversationMode } from "./conversationMode";

const modeReplies: Record<ConversationMode, string[]> = {
  casual: [
    "へえ、そうだったんですね。何気ない一日の話って、聞いているとその場の感じが浮かびます。",
    "なるほど。そういう時間があると、一日の手触りが少し残りますね。",
    "うん、聞いています。その時の様子、もう少しだけ教えてもらえますか？",
  ],
  reminiscence: [
    "その頃の話、いいですね。当時よく行っていた場所はありましたか？",
    "懐かしい話ですね。その頃は、どんなことが楽しみでしたか？",
    "その話、もう少し聞きたいです。どんな景色が浮かびますか？",
  ],
  loneliness: [
    "そうでしたか。今日は少し寂しい感じがあったんですね。今はどんなふうに過ごされていますか？",
    "うん、そういう日もありますね。ひとりの時間が長く感じた場面があったんでしょうか。",
    "少し心細い感じがあったんですね。今日は誰かの声を聞く時間はありましたか？",
  ],
  anxiety: [
    "それは気になりますね。急がなくていいので、いま一番引っかかっていることは何ですか？",
    "なるほど、落ち着かない感じがあるんですね。いつ頃から気になっていましたか？",
    "うん、それは心配になりますね。今そばにあると少し安心できるものはありますか？",
  ],
  daily_life: [
    "そこまで行かれたんですね。外の空気はどんな感じでしたか？",
    "その用事を済ませたんですね。何か目に留まったものはありましたか？",
    "うん、日々のことって一つ済むだけでも少し違いますね。その時は体の感じはいかがでしたか？",
  ],
  continuation: [
    "それで、それで？",
    "その話、もう少し聞きたいです。",
    "うん、続きもゆっくり聞かせてください。",
  ],
  safety: [
    getUrgentSafetyReply(),
  ],
};

const emotionReplies: Partial<Record<EmotionLabel, string[]>> = {
  sad: [
    "少し大変だったんですね。今日は少し頑張りすぎた一日だったのかもしれませんね。",
    "うん、しんどさが残る日だったんですね。今は少し落ち着けていますか？",
  ],
  positive: [
    "へえ、いいですね。その時の様子、もう少し聞きたいです。",
    "それはよかったですね。今日はそのことが少し心に残っているんですね。",
  ],
};

const keywordReplies: Array<{ terms: string[]; replies: string[] }> = [
  {
    terms: ["カレー"],
    replies: [
      "カレーだったんですね。家のカレーって、ちょっと安心する味がありますよね。どんな具が入っていました？",
      "いいですね、カレー。香りだけで少し元気が出る感じがありますが、辛さはどのくらいでしたか？",
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
    terms: ["誰とも話してない", "誰とも話していない", "誰にも会わない"],
    replies: [
      "今日は人の声が少ない一日だったんですね。そういう日は、時間がゆっくり過ぎる感じがありますか？",
      "そうでしたか。人と話さない時間が続くと、部屋の静けさがいつもより大きく感じることがありますね。",
    ],
  },
  {
    terms: ["スーパー", "買い物"],
    replies: [
      "スーパーまで行かれたんですね。何か目に留まったものはありましたか？",
      "買い物に行かれたんですね。売り場って、季節のものが少しずつ変わりますよね。",
    ],
  },
];

function getRecentOpeners(recentMessages: StoredChatMessage[]) {
  return recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content.slice(0, 6));
}

function pickReply(replies: string[], recentMessages: StoredChatMessage[] = []) {
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
  moodScore,
  mode,
  recentMessages = [],
}: {
  message: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  moodScore?: number | null;
  mode: ConversationMode;
  recentMessages?: StoredChatMessage[];
}) {
  if (riskLevel === "urgent") {
    return getUrgentSafetyReply();
  }

  const keywordReply = keywordReplies.find((item) =>
    item.terms.some((term) => message.includes(term)),
  );

  if (keywordReply) {
    return pickReply(keywordReply.replies, recentMessages);
  }

  if (emotionLabel === "neutral" && moodScore === 1) {
    return "そうでしたか。今日は少し重たい感じの日なんですね。今、少し楽にできそうなことはありますか？";
  }

  if (emotionLabel === "neutral" && moodScore === 2) {
    return "うん、今日は少し無理をしないほうがよさそうですね。今はどんなふうに過ごされていますか？";
  }

  if (emotionLabel === "neutral" && moodScore === 4) {
    return "へえ、今日は少し良い感じなんですね。何かそう感じる出来事がありましたか？";
  }

  if (emotionLabel === "neutral" && moodScore === 5) {
    return "それはいいですね。今日はどんなことが一番心に残っていますか？";
  }

  return pickReply(
    emotionReplies[emotionLabel] ?? modeReplies[mode] ?? modeReplies.casual,
    recentMessages,
  );
}
