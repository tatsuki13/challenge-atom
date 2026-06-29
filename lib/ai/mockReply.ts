import type { EmotionLabel, RiskLevel } from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";

const repliesByEmotion: Record<EmotionLabel, string[]> = {
  lonely: [
    "そうでしたか。今日は少し寂しい感じがあったんですね。今はどんなふうに過ごされていますか？",
    "うん、そういう日もありますね。ひとりの時間が長く感じた場面があったんでしょうか。",
    "少し心細い感じがあったんですね。今日は誰かの声を聞く時間はありましたか？",
  ],
  sad: [
    "少し大変だったんですね。今日は少し頑張りすぎた一日だったのかもしれませんね。",
    "うん、しんどさが残る日だったんですね。今は少し落ち着けていますか？",
    "そうでしたか。無理に元気にしなくてもいいので、そのことをもう少し聞かせてもらえますか。",
  ],
  anxious: [
    "それは気になりますね。急がなくていいので、いま一番引っかかっていることは何ですか？",
    "なるほど、落ち着かない感じがあるんですね。いつ頃から気になっていましたか？",
    "うん、それは心配になりますね。今そばにあると少し安心できるものはありますか？",
  ],
  positive: [
    "へえ、いいですね。そう感じたのは、どんな場面でしたか？",
    "ああ、それは嬉しいですね。その時の様子、もう少し聞きたいです。",
    "それはよかったですね。今日はそのことが少し心に残っているんですね。",
  ],
  reminiscence: [
    "へえ、その頃のことが浮かんだんですね。その場所のこと、もう少し聞かせてもらえますか？",
    "それは印象に残りますね。当時はどんな景色でしたか？",
    "いいですね、その話はもう少し聞きたいです。その頃は何が楽しみでしたか？",
  ],
  neutral: [
    "そうなんですね。今日はどんなことが一番印象に残っていますか？",
    "なるほど。では、そのあとどんなふうに過ごされましたか？",
    "うん、聞いています。その時はどんな感じでしたか？",
  ],
};

function pickReply(replies: string[]) {
  return replies[Math.floor(Math.random() * replies.length)] ?? replies[0];
}

export function createMockReply({
  emotionLabel,
  riskLevel,
}: {
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
}) {
  if (riskLevel === "urgent") {
    return getUrgentSafetyReply();
  }

  return pickReply(repliesByEmotion[emotionLabel]);
}
