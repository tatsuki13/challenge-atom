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
    return "そう感じる日もありますよね。話してくれてありがとうございます。今日はどんなことが一番心に残っていますか？";
  }

  if (emotionLabel === "reminiscence") {
    return "そのお話、もう少し聞かせてください。その頃によく行っていた場所はありますか？";
  }

  if (emotionLabel === "anxious") {
    return "不安な気持ちがあるのですね。今ここで少しずつ話して大丈夫です。何が一番気になっていますか？";
  }

  if (emotionLabel === "sad") {
    return "つらい気持ちを話してくれてありがとうございます。無理に元気を出さなくても大丈夫です。今はどんなことを聞いてほしいですか？";
  }

  return "聞かせてくれてありがとうございます。今日はどんな一日でしたか？";
}
