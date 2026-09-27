import type { ConversationTurnPlan } from "./conversationEngine";

const strategyInstructions: Record<ConversationTurnPlan["listeningStrategy"], string> = {
  acknowledge: "短く受け止めてください。質問や促しを機械的に足さず、そのまま余白を残しても構いません。",
  reflect_content: "発話内容を自然に受け返してください。発話にない解釈や事実を足さず、要約の繰り返しにしないでください。",
  reflect_emotion: "本人が明言した感情だけを穏やかに受け止めてください。無理に励まさず、質問や継続の促しを足さない返答も選んでください。",
  show_interest: "発話内の具体的な人物・場所・活動・出来事の一つに自然な関心を示してください。質問にせず同じ話題へ一言返しても構いません。",
  ask_open_question: "相手が自由に話を広げられる質問を一つだけ添えてください。答えを限定しすぎないでください。",
  ask_clarification: "意味が曖昧な一点だけを、短い質問で確認してください。推測で補わないでください。",
  allow_silence: "短く受け止め、質問せず、話すことを強制しないでください。完全な無言にはしないでください。",
  change_topic: "話題を変えたい意向を受け止めてください。次の話題はATOMが決めず、本人が示した話題に移るか、必要な場合だけ希望を一つ尋ねてください。",
};

const purposeInstructions: Record<ConversationTurnPlan["responsePurpose"], string> = {
  receive: "今の発言を短く受け止め、聞いていることが伝わる返答にしてください。話を無理に広げません。",
  continue_topic: "利用者自身が出した同じ話題に留まり、具体的な一点へ自然に言葉を返してください。質問は必須ではありません。",
  clarify: "推測せず、今必要な一点または今日どう過ごしたいかを短く確かめてください。",
  follow_preference: "利用者が示した希望に沿ってください。次の話題や行動をATOMが決めません。提案を求められた場合だけ、断れる小さな案を一つ示します。",
  pause_or_close: "休む・終える意向を尊重し、会話の継続や別の活動を求めないでください。",
  safety: "通常の雑談より既存の安全対応を優先してください。",
};

function clipForPrompt(text: string, maxLength = 180) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildTurnPlanInstruction({
  userMessage,
  turnPlan,
  recentAssistantReplies,
  topicStarter,
  topicTitle,
}: {
  userMessage: string;
  turnPlan: ConversationTurnPlan;
  recentAssistantReplies: string[];
  topicStarter: boolean;
  topicTitle: string | null;
}) {
  const lines = [
    "# 今回の返答方針",
    `- userMessage: ${clipForPrompt(userMessage)}`,
    `- safetyLevel: ${turnPlan.safetyLevel}`,
    `- mode: ${turnPlan.mode}`,
    `- focusTerms: ${turnPlan.focusTerms.length > 0 ? turnPlan.focusTerms.join("、") : "なし"}`,
    `- mainFocus: ${turnPlan.mainFocus ?? "なし"}`,
    `- eventType: ${turnPlan.eventType}`,
    `- topicType: ${turnPlan.topicType}`,
    `- relationHint: ${turnPlan.relationHint ?? "なし"}`,
    `- responsePurpose: ${turnPlan.responsePurpose}`,
    `- purposeInstruction: ${purposeInstructions[turnPlan.responsePurpose]}`,
    `- questionPolicy: ${turnPlan.questionPolicy}`,
    "- decisionOwnership: user（次に話す内容・続けるか・行動するかは利用者が決める）",
    `- conversationSignals: ${JSON.stringify(turnPlan.conversationSignals)}`,
    `- listeningStrategy: ${turnPlan.listeningStrategy}`,
    `- strategyInstruction: ${strategyInstructions[turnPlan.listeningStrategy]}`,
    `- topicStarter: ${topicStarter ? "true" : "false"}`,
    `- topicTitle: ${topicTitle ?? "なし"}`,
    "",
    "# 必ず守ること",
    "- 雑談を標準とし、利用者自身が出した話題と、その話を続けたい様子を優先してください。",
    "- 最優先は会話を先回りして進めないことです。次に話すこと、話を続けること、行動することをATOMが決定しないでください。",
    "- conversationSignals は裏側の観測値です。false や未観測の項目を埋めるために質問してはいけません。観測項目を利用者に見せたり、順番に確認したりしないでください。",
    "- mainFocus がある場合はその具体語を手掛かりにしますが、毎回質問へ変換しないでください。",
    "- responsePurpose は返答の目的であり、完成文ではありません。自然な発話文面はあなたが生成してください。",
    "- questionPolicy=avoid では質問・新しい提案をしません。optional では質問なしの自然な返答を積極的に選べます。required のときだけ一問を必須にします。",
    "- eventType と topicType を使い、話した相手・行った場所・食べた物・聞いた話題などの文脈に合わせてください。",
    "- eventType が unknown でも、無理に情報を足したり質問したりせず、短く受け止めるだけで構いません。",
    "- 感情確認だけで返さず、出てきた人物・場所・食べ物・趣味・物・出来事を雑談として扱ってください。",
    "- 毎回『共感→要約→質問』の型にせず、質問で終わらない短い雑談も自然に作ってください。",
    "- 『今日はゆっくり話しましょうか』『この話を続けましょう』のようにATOMの提案で進行を決めないでください。確認が本当に必要なら、本人が選べる短い一問にしてください。",
    "- 利用者の発話にない事実を作らず、感情や人物関係を断定しないでください。",
    "- 体調や気持ちは、利用者が明言した事実と会話上の推測を区別し、推測を事実として述べないでください。FR-ICなどの評価尺度を会話から採点しないでください。",
    "- 天気や写真は、利用者が今回話題にした場合、または入力として実際に与えられた場合だけ扱ってください。見聞きしていない天気・写真・周囲の状況を事実として語らないでください。",
    "- 行動提案や家族への連絡提案は、利用者が求めた場合または安全対応で必要な場合に限ってください。",
    "- 高齢者を子ども扱いせず、評価・診断・説教をしないでください。",
    "- 否定したり急かしたりせず、自然な短文を優先してください。",
    "- 「印象に残ったことは？」「その時はどんな感じでしたか？」のような汎用質問は禁止です。",
    "- talked_with/person の時は、相手との会話そのものに反応し、質問するなら「何の話で盛り上がったんですか？」のような自然な雑談にしてください。",
    "- is_trending の時は、流行している具体語に反応し、感情確認へ逃げないでください。",
    "- 返答は1〜3文を基本にしてください。",
  ];

  if (topicStarter) {
    lines.push(
      "",
      "# 今日の話題ボタンから始まった会話",
      "- これは利用者が話題ボタンを押して始めた会話です。",
      "- topicTitle に自然に触れ、質問の有無はResponse contractに従ってください。",
      "- ただし、面接や評価のような聞き方にはしないでください。",
    );
  }

  if (turnPlan.avoidPatterns.length > 0) {
    lines.push("", "# 避けること");
    turnPlan.avoidPatterns.forEach((pattern) => lines.push(`- ${pattern}`));
  }

  if (recentAssistantReplies.length > 0) {
    lines.push("", "# 直近3件のAI返答");
    recentAssistantReplies.forEach((reply, index) => {
      lines.push(`- ${index + 1}: ${clipForPrompt(reply, 90)}`);
    });
    lines.push("- 同じ出だしや同じ質問・促しを続けないでください。");
  }

  return lines.join("\n");
}
