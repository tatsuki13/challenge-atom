import type {
  ListeningStrategy,
  MemoryPromptContext,
  MemoryRetrievalMode,
  ReplyRejectionReason,
} from "../conversationTypes";
import type {
  ConversationSignals,
  QuestionPolicy,
  ResponsePurpose,
} from "./conversationEngine";

export type ReplyContract = {
  mode: MemoryRetrievalMode | "safety";
  memoryRole: "none" | "answer_context" | "candidate_presentation" | "clarification" | "safety";
  maximumQuestions: number | null;
  questionPolicy: QuestionPolicy;
  requiresQuestion: boolean;
  requiresContinuationCue: boolean;
  requiresClarificationIntent: boolean;
  mayUseConfirmedMemory: boolean;
};

export type ReplyValidationInput = {
  text: string;
  memoryMode: MemoryRetrievalMode | "safety";
  memorySelectionRequired?: boolean;
  listeningStrategy?: ListeningStrategy | null;
  questionPolicy?: QuestionPolicy;
  responsePurpose?: ResponsePurpose;
  conversationSignals?: ConversationSignals | null;
  memoryConfirmationContent?: string | null;
  memories?: MemoryPromptContext[];
  currentUserMessage: string;
};

export type ReplyValidationResult = {
  accepted: boolean;
  reason: ReplyRejectionReason | null;
  questionCount: number;
};

export function getReplyContract(
  mode: MemoryRetrievalMode | "safety",
  memorySelectionRequired = false,
  _listeningStrategy: ListeningStrategy | null = null,
  questionPolicy?: QuestionPolicy,
): ReplyContract {
  const requestedQuestionPolicy =
    questionPolicy ?? (_listeningStrategy === "allow_silence" ? "avoid" : "optional");
  const effectiveQuestionPolicy: QuestionPolicy =
    mode === "clarification" || memorySelectionRequired ? "required" : requestedQuestionPolicy;
  const requiresQuestion = effectiveQuestionPolicy === "required";
  const requiresContinuationCue =
    mode === "clarification" || (mode === "category_browse" && memorySelectionRequired);
  if (mode === "safety") return { mode, memoryRole: "safety", maximumQuestions: null, questionPolicy: "required", requiresQuestion: false, requiresContinuationCue: false, requiresClarificationIntent: false, mayUseConfirmedMemory: false };
  if (mode === "clarification") return { mode, memoryRole: "clarification", maximumQuestions: 1, questionPolicy: effectiveQuestionPolicy, requiresQuestion, requiresContinuationCue, requiresClarificationIntent: true, mayUseConfirmedMemory: false };
  if (mode === "category_browse") return { mode, memoryRole: "candidate_presentation", maximumQuestions: 1, questionPolicy: effectiveQuestionPolicy, requiresQuestion, requiresContinuationCue, requiresClarificationIntent: memorySelectionRequired, mayUseConfirmedMemory: true };
  if (mode === "topic_match") return { mode, memoryRole: "answer_context", maximumQuestions: 1, questionPolicy: effectiveQuestionPolicy, requiresQuestion, requiresContinuationCue, requiresClarificationIntent: false, mayUseConfirmedMemory: true };
  return { mode, memoryRole: "none", maximumQuestions: 1, questionPolicy: effectiveQuestionPolicy, requiresQuestion, requiresContinuationCue, requiresClarificationIntent: false, mayUseConfirmedMemory: false };
}

export function getReplyContractInstructions(contract: ReplyContract) {
  const lines = [
    "# Response contract",
    `- contractMode: ${contract.mode}`,
    contract.maximumQuestions === null
      ? "- Follow the existing safety response without applying normal-conversation question limits."
      : contract.questionPolicy === "required"
        ? "- Ask exactly one short question needed by the response purpose."
        : contract.questionPolicy === "avoid"
          ? "- Do not ask a question in this turn. Leave calm conversational space instead."
          : "- A question is optional, not the default. Use at most one only when it genuinely helps the same topic continue.",
    contract.requiresContinuationCue
      ? "- After acknowledging the user, leave exactly one natural opening for them to continue: either one question or one brief non-question invitation. Do not end with acknowledgement alone."
      : "- A question or continuation prompt is not required. A complete statement may end the response naturally.",
  ];
  if (contract.mode === "none") return [...lines, "- Give a normal conversational response and do not imply that any prior memory was used."];
  if (contract.mode === "topic_match") return [...lines,
    "- Use only selected confirmed memories relevant to the current message; do not list or unnaturally repeat them.",
    "- A follow-up question is optional; a brief invitation to continue may be used instead.",
    "- Do not add a remembered fact absent from the supplied memory context.",
  ];
  if (contract.mode === "category_browse") return [...lines,
    "- Present only the supplied candidates, briefly and without adding another remembered fact.",
    contract.requiresClarificationIntent
      ? "- Several candidates exist: end with one selection question or one clear selection request."
      : "- With a small candidate set, leave one brief question or invitation after presenting it.",
    "- Candidate list items are statements, not separate questions.",
  ];
  return [...lines,
    "- No specific memory was selected. Do not state or invent a concrete remembered fact.",
    "- Return one short clarification question or one clear request for the user to identify the topic.",
  ];
}

function stripQuotedAndCandidateText(text: string) {
  const withoutQuotes = text
    .replace(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|'[^']*'/gu, "")
    .replace(/`[^`]*`/gu, "");
  return withoutQuotes.split(/\r?\n/u).filter((line) =>
    !/^\s*(?:[-*•・]|\d+[.)、])\s*/u.test(line)
  ).join("\n");
}

export function countQuestions(text: string) {
  const inspectable = stripQuotedAndCandidateText(text);
  let count = 0;
  for (const match of inspectable.matchAll(/([^。！？?!\n]*)([?？]+[!！]*|[。！\n]|$)/gu)) {
    const sentence = match[1].trim();
    const terminator = match[2];
    if (!sentence && !terminator) continue;
    if (/^[?？]/u.test(terminator)) count += 1;
    else if (/(?:です|ます|でしょう|ません|なの|だったの)か(?:ね|な)?\s*$/u.test(sentence)) count += 1;
  }
  return count;
}

function hasClarificationIntent(text: string, questionCount: number) {
  return questionCount > 0 || /(?:教えて(?:ください|もらえ)|確認させて|お聞かせください|どれ|どのこと|どの話題|もう少し具体的|選んでください)/u.test(text);
}

export function hasContinuationCue(text: string, questionCount = countQuestions(text)) {
  if (questionCount > 0) return true;
  return /(?:教えて(?:ください|もらえ)|聞かせて(?:ください|もらえ)|話して(?:ください|もらえ)|お聞かせください|続けて(?:ください|もらえ)|話しやすいところから|思い浮かぶことがあれば|よければ|差し支えなければ|気が向いたら|話したくなったら|続けたくなったら|聞いてみたい|気になります|話はいかがでしょう|思い浮かぶもの)/u.test(text);
}

function normalizeClaimText(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function hasMemoryFacade(text: string) {
  return /(?:覚えています|覚えております|記憶に残っています|前に.{0,24}(?:話して|言って)|以前.{0,24}(?:話して|言って))/u.test(text);
}

function hasConcreteRememberedAssertion(text: string) {
  return /(?:覚えています|記憶に残っています|前に|以前).{0,40}(?:好き|苦手|嫌い|したい|している|行った|住んで)|(?:好き|苦手|嫌い|したい|している|行った|住んで).{0,24}(?:覚えています|話していました|言っていました)/u.test(text);
}

function extractPersonalClaimSubjects(text: string) {
  const subjects = new Set<string>();
  for (const match of text.matchAll(/(?:^|[、。でと])([一-龠々ぁ-んァ-ヶーA-Za-z0-9]{1,24})(?:が|は|も)(?:好き|苦手|嫌い)/gu)) {
    subjects.add(match[1].replace(/^(?:以前|前に|私は|わたしは|今は)/u, ""));
  }
  for (const match of text.matchAll(/([一-龠々ぁ-んァ-ヶーA-Za-z0-9]{1,24})(?:を)?(?:始めたい|習いたい|してみたい)/gu)) {
    subjects.add(match[1].replace(/^(?:将来は|これから|私は|わたしは)/u, ""));
  }
  return [...subjects].filter(Boolean);
}

function hasUnsupportedClaim(text: string, memories: MemoryPromptContext[], currentUserMessage: string) {
  const reference = normalizeClaimText([currentUserMessage, ...memories.map((memory) => memory.content)].join(" "));
  return extractPersonalClaimSubjects(text).some((subject) => !reference.includes(normalizeClaimText(subject)));
}

function contradictsCurrentUtterance(text: string, currentUserMessage: string) {
  const current = normalizeClaimText(currentUserMessage);
  const reply = normalizeClaimText(text);
  const negative = /([一-龠々ぁ-んァ-ヶーA-Za-z0-9]{1,20})(?:が|は)(?:嫌い|苦手|好きではない)/u.exec(current);
  if (negative) {
    const subject = negative[1].slice(-12);
    if (subject && reply.includes(subject) && /好き/u.test(reply) && !/(?:嫌い|苦手|好きではない)/u.test(reply)) return true;
  }
  const positive = /([一-龠々ぁ-んァ-ヶーA-Za-z0-9]{1,20})(?:が|は)好き/u.exec(current);
  if (positive) {
    const subject = positive[1].slice(-12);
    if (subject && reply.includes(subject) && /(?:嫌い|苦手)/u.test(reply)) return true;
  }
  return false;
}

function includesRequiredMemoryConsent(text: string, content: string) {
  const normalizedText = normalizeClaimText(text);
  const normalizedContent = normalizeClaimText(content);
  return (
    normalizedContent.length > 0 &&
    normalizedText.includes(normalizedContent) &&
    /「[^」]+」/u.test(text) &&
    /覚えておいても(?:よい|いい)ですか/u.test(text)
  );
}

function violatesConversationGrounding(input: ReplyValidationInput, text: string) {
  const signals = input.conversationSignals;
  const questionCount = countQuestions(text);
  const inspectableText = stripQuotedAndCandidateText(text);
  if (/FR-?IC|フレイル.{0,12}(?:点|スコア|評価)/iu.test(text)) return true;
  if (/(?:しましょう|していきましょう)(?:か)?/u.test(inspectableText)) return true;
  if (
    signals &&
    !signals.explicitFeeling &&
    /(?:寂しい|さびしい|悲しい|不安な|つらい気持ち)/u.test(text)
  ) return true;
  if (
    signals &&
    !signals.suggestionRequested &&
    input.responsePurpose !== "follow_preference" &&
    /(?:してみませんか|してみては|連絡してみ|電話してみ|出かけてみ|試してみ)/u.test(text)
  ) return true;
  if (signals && !signals.weatherMentioned && /(?:今日|外).{0,8}(?:晴れ|雨|雪|曇り|暑い|寒い|いい天気)/u.test(text)) return true;
  if (signals && !signals.photoMentioned && /(?:写真|画像).{0,12}(?:見え|写って|拝見|見ました)/u.test(text)) return true;
  if (
    questionCount > 0 &&
    input.questionPolicy !== "required" &&
    [
      { reply: /(?:睡眠|眠れ|眠り)/u, source: /(?:睡眠|眠れ|眠り|寝た|寝られ)/u },
      { reply: /(?:食事|食欲|食べられ)/u, source: /(?:食事|食欲|食べ|ご飯|朝食|昼食|夕食)/u },
      { reply: /(?:体調|具合|痛み)/u, source: /(?:体調|具合|痛|だる|しんど|疲れ)/u },
      { reply: /(?:気分|気持ち)/u, source: /(?:気分|気持ち|寂し|さびし|不安|悲し|うれし|嬉し|楽し)/u },
    ].some(({ reply, source }) => reply.test(text) && !source.test(input.currentUserMessage))
  ) return true;
  return false;
}

export function validateReplyAgainstContract(input: ReplyValidationInput): ReplyValidationResult {
  const text = input.text.normalize("NFKC").trim();
  if (!text) return { accepted: false, reason: "empty_response", questionCount: 0 };
  const contract = getReplyContract(
    input.memoryMode,
    input.memorySelectionRequired,
    input.listeningStrategy,
    input.questionPolicy,
  );
  if (contract.mode === "safety") return { accepted: true, reason: null, questionCount: countQuestions(text) };
  const questionCount = countQuestions(text);
  if (contract.maximumQuestions !== null && questionCount > contract.maximumQuestions) return { accepted: false, reason: "too_many_questions", questionCount };
  if (contract.questionPolicy === "avoid" && questionCount > 0) return { accepted: false, reason: "mode_contract_violation", questionCount };
  if (
    (contract.mode === "none" && hasMemoryFacade(text)) ||
    (contract.mode === "clarification" && hasConcreteRememberedAssertion(text)) ||
    ((contract.mode === "topic_match" || contract.mode === "category_browse") && hasUnsupportedClaim(text, input.memories ?? [], input.currentUserMessage))
  ) return { accepted: false, reason: "unsupported_memory_claim", questionCount };
  if (
    input.memoryConfirmationContent &&
    !includesRequiredMemoryConsent(text, input.memoryConfirmationContent)
  ) return { accepted: false, reason: "mode_contract_violation", questionCount };
  if (
    contract.requiresQuestion &&
    questionCount === 0 &&
    !hasClarificationIntent(text, questionCount)
  ) return { accepted: false, reason: "missing_clarification", questionCount };
  if (contract.requiresClarificationIntent && !hasClarificationIntent(text, questionCount)) return { accepted: false, reason: "missing_clarification", questionCount };
  if (contradictsCurrentUtterance(text, input.currentUserMessage)) return { accepted: false, reason: "mode_contract_violation", questionCount };
  if (violatesConversationGrounding(input, text)) return { accepted: false, reason: "mode_contract_violation", questionCount };
  if (contract.requiresContinuationCue && !hasContinuationCue(text, questionCount)) return { accepted: false, reason: "missing_continuation_cue", questionCount };
  return { accepted: true, reason: null, questionCount };
}
