import type {
  EmotionLabel,
  RiskLevel,
  StoredChatMessage,
} from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";
import type {
  ConversationMode,
  ConversationPlan,
  ReplyPattern,
} from "./conversationPlanner";

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

const patternReplies: Record<ReplyPattern, string[]> = {
  small_talk_only: [
    "へえ、そうだったんですね。そういう何気ない話、なんだかその日の感じが出ますね。",
    "いいですね。そういう小さな出来事があると、一日が少し違って感じられますね。",
    "なるほど。聞いていると、その場の様子が少し浮かんできます。",
  ],
  empathy_only: [
    "そうでしたか。今日はその感じが少し残っているんですね。",
    "うん、そういう日もありますね。急がず、そのまま話して大丈夫ですよ。",
    "少し大変だったんですね。今はここでゆっくり話せます。",
  ],
  empathy_plus_question: [
    "それは気になりますね。今いちばん引っかかっているのは、どのあたりですか？",
    "うん、その感じは軽く見られないですね。今日はいつ頃から気になっていましたか？",
  ],
  concrete_reaction_plus_question: [
    "それはいいですね。どんな感じだったんですか？",
    "へえ、ちょっと気になりますね。何が一番印象に残りましたか？",
  ],
  continue_prompt: [
    "それで、それで？",
    "その話、もう少し聞きたいです。",
    "うん、続きもゆっくり聞かせてください。",
  ],
  reminiscence_prompt: [
    "その頃の話、いいですね。当時よく行っていた場所はありましたか？",
    "懐かしい話ですね。その頃は、どんなことが楽しみでしたか？",
  ],
  safety_guidance: [getUrgentSafetyReply()],
};

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
  plan,
  recentMessages = [],
}: {
  message: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  plan: ConversationPlan;
  recentMessages?: StoredChatMessage[];
}) {
  if (riskLevel === "urgent") {
    return getUrgentSafetyReply();
  }

  const keywordReply = keywordReplies.find((item) =>
    item.terms.some((term) => message.includes(term)),
  );

  if (keywordReply && plan.shouldAskQuestion) {
    return pickReply(keywordReply.replies, recentMessages);
  }

  if (keywordReply) {
    return pickReply(
      keywordReply.replies.map((reply) => reply.replace(/。[^。？]*？$/, "。")),
      recentMessages,
    );
  }

  return pickReply(
    patternReplies[plan.replyPattern] ??
      emotionReplies[emotionLabel] ??
      modeReplies[plan.mode] ??
      modeReplies.casual,
    recentMessages,
  );
}
