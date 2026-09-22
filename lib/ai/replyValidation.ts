import type {
  MemoryPromptContext,
  MemoryRetrievalMode,
  ReplyRejectionReason,
} from "../conversationTypes";

export type ReplyContract = {
  mode: MemoryRetrievalMode | "safety";
  memoryRole: "none" | "answer_context" | "candidate_presentation" | "clarification" | "safety";
  maximumQuestions: number | null;
  requiresClarificationIntent: boolean;
  mayUseConfirmedMemory: boolean;
};

export type ReplyValidationInput = {
  text: string;
  memoryMode: MemoryRetrievalMode | "safety";
  memorySelectionRequired?: boolean;
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
): ReplyContract {
  if (mode === "safety") return { mode, memoryRole: "safety", maximumQuestions: null, requiresClarificationIntent: false, mayUseConfirmedMemory: false };
  if (mode === "clarification") return { mode, memoryRole: "clarification", maximumQuestions: 1, requiresClarificationIntent: true, mayUseConfirmedMemory: false };
  if (mode === "category_browse") return { mode, memoryRole: "candidate_presentation", maximumQuestions: 1, requiresClarificationIntent: memorySelectionRequired, mayUseConfirmedMemory: true };
  if (mode === "topic_match") return { mode, memoryRole: "answer_context", maximumQuestions: 1, requiresClarificationIntent: false, mayUseConfirmedMemory: true };
  return { mode, memoryRole: "none", maximumQuestions: 1, requiresClarificationIntent: false, mayUseConfirmedMemory: false };
}

export function getReplyContractInstructions(contract: ReplyContract) {
  const lines = [
    "# Response contract",
    `- contractMode: ${contract.mode}`,
    contract.maximumQuestions === null
      ? "- Follow the existing safety response without applying normal-conversation question limits."
      : "- A user-facing question is optional and there may be at most one independent question or request for clarification.",
  ];
  if (contract.mode === "none") return [...lines, "- Give a normal conversational response and do not imply that any prior memory was used."];
  if (contract.mode === "topic_match") return [...lines,
    "- Use only selected confirmed memories relevant to the current message; do not list or unnaturally repeat them.",
    "- A follow-up question is optional even when the conversation plan suggests one.",
    "- Do not add a remembered fact absent from the supplied memory context.",
  ];
  if (contract.mode === "category_browse") return [...lines,
    "- Present only the supplied candidates, briefly and without adding another remembered fact.",
    contract.requiresClarificationIntent
      ? "- Several candidates exist: end with one selection question or one clear selection request."
      : "- With a small candidate set, a follow-up question is optional.",
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

export function validateReplyAgainstContract(input: ReplyValidationInput): ReplyValidationResult {
  const text = input.text.normalize("NFKC").trim();
  if (!text) return { accepted: false, reason: "empty_response", questionCount: 0 };
  const contract = getReplyContract(input.memoryMode, input.memorySelectionRequired);
  if (contract.mode === "safety") return { accepted: true, reason: null, questionCount: countQuestions(text) };
  const questionCount = countQuestions(text);
  if (contract.maximumQuestions !== null && questionCount > contract.maximumQuestions) return { accepted: false, reason: "too_many_questions", questionCount };
  if (
    (contract.mode === "none" && hasMemoryFacade(text)) ||
    (contract.mode === "clarification" && hasConcreteRememberedAssertion(text)) ||
    ((contract.mode === "topic_match" || contract.mode === "category_browse") && hasUnsupportedClaim(text, input.memories ?? [], input.currentUserMessage))
  ) return { accepted: false, reason: "unsupported_memory_claim", questionCount };
  if (contract.requiresClarificationIntent && !hasClarificationIntent(text, questionCount)) return { accepted: false, reason: "missing_clarification", questionCount };
  if (contradictsCurrentUtterance(text, input.currentUserMessage)) return { accepted: false, reason: "mode_contract_violation", questionCount };
  return { accepted: true, reason: null, questionCount };
}
