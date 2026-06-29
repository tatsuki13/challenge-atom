import type { EmotionLabel, RiskLevel } from "../conversationTypes";
import { getUrgentSafetyReply } from "../safety";

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

  if (emotionLabel === "lonely") {
    return "そうでしたか。今日は少し寂しい感じがあったんですね。誰かと話す時間はありましたか？";
  }

  if (emotionLabel === "reminiscence") {
    return "へえ、その頃のことが浮かんだんですね。その場所のこと、もう少し聞かせてもらえますか？";
  }

  if (emotionLabel === "anxious") {
    return "それは気になりますね。急がなくていいので、いま一番引っかかっていることは何ですか？";
  }

  if (emotionLabel === "sad") {
    return "うん、しんどい日だったんですね。今日は食事や眠りはいつも通りでしたか？";
  }

  if (emotionLabel === "positive") {
    return "それはいいですね。そう感じたのは、どんな場面でしたか？";
  }

  return "そうなんですね。今日は外に出たり、誰かと話したりする時間はありましたか？";
}
