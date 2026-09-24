"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  EmotionLabel,
  MemoryCategory,
  MemoryExtractionResult,
  MessageInputType,
  MetricsSummary,
  RiskLevel,
} from "@/lib/conversationTypes";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  emotionLabel?: EmotionLabel;
  riskLevel?: RiskLevel;
  debug?: ConversationDebug;
};

type ConversationDebug = {
  usedMock: boolean;
  planSource?: string;
  generationSource: string;
  listeningStrategy: string | null;
  mode: string;
  mainFocus: string | null;
  focusTerms: string[];
  eventType: string;
  topicType: string;
  shouldAskQuestion: boolean;
  suggestedQuestion?: string | null;
  topicStarter: boolean;
  memoryExtraction: {
    status: MemoryExtractionResult["status"];
    candidateCount: number;
    categories: MemoryCategory[];
    rejectedCount: number;
    rejectionReasonCodes: string[];
  };
};

type ChatResponse = {
  reply: string;
  conversationId: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  usedMock: boolean;
  userMessageId: string;
  assistantMessageId: string;
  decisionId: string;
  listeningStrategy: string | null;
  sourceUtteranceIds: string[];
  planSource: string;
  generationSource: string;
  memoryExtraction: MemoryExtractionResult;
  debug?: ConversationDebug;
};

type ConversationSessionResponse = {
  conversationId: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    emotionLabel: EmotionLabel | null;
    riskLevel: RiskLevel;
  }>;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "こんにちは。今日はどんな一日でしたか？ゆっくりで大丈夫です。",
    emotionLabel: "positive",
    riskLevel: "none",
  },
];

const topics = [
  "子どものころによく遊んだ場所のこと",
  "昔の学校や職場で覚えていること",
  "町内会やご近所の人と話したこと",
  "家族や友人と最近話したこと",
  "近所の喫茶店や好きな飲み物のこと",
  "買い物で目に留まったもの",
  "散歩で見かけた景色や花のこと",
  "テレビやニュースで気になったこと",
  "編み物や手仕事など好きな趣味のこと",
  "最近、少しうれしかったこと",
  "昔よく食べていた好きな料理のこと",
  "今日の体の調子や気分のこと",
  "季節の思い出や楽しみなこと",
];

const moodOptions = [
  { value: 1, label: "重い" },
  { value: 2, label: "少し重い" },
  { value: 3, label: "普通" },
  { value: 4, label: "まあ良い" },
  { value: 5, label: "良い" },
];

function createClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function getAvatarMood(message: ChatMessage) {
  if (message.riskLevel === "urgent" || message.riskLevel === "watch") {
    return "worried";
  }

  if (
    message.emotionLabel === "positive" ||
    message.emotionLabel === "reminiscence"
  ) {
    return "happy";
  }

  return "calm";
}

function PetAvatar({ mood }: { mood: "happy" | "worried" | "calm" }) {
  return (
    <span className="pet-avatar" data-mood={mood} aria-hidden="true">
      <span className="pet-mouth" />
    </span>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    Boolean(target.closest("input, textarea, select, button, a"))
  );
}

export default function ConversationClient({
  initialConversationId,
}: {
  initialConversationId?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState<MessageInputType>("text");
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  );
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [restoringConversation, setRestoringConversation] = useState(
    Boolean(initialConversationId),
  );
  const [endingConversation, setEndingConversation] = useState(false);
  const [conversationNotice, setConversationNotice] = useState<string | null>(null);
  const [topicIndex, setTopicIndex] = useState(0);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [latestDebug, setLatestDebug] = useState<ConversationDebug | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechHoldActiveRef = useRef(false);
  const transcriptBaseRef = useRef("");
  const finalTranscriptRef = useRef("");
  const restoredConversationIdRef = useRef<string | null>(null);

  const conversationQuery = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : "";
  const conversationBusy = sending || restoringConversation || endingConversation;

  const refreshMetrics = useCallback(async () => {
    try {
      const response = await fetch("/api/metrics", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as MetricsSummary;
      setMetrics(data);
    } catch {
      setMetrics(null);
    }
  }, []);

  useEffect(() => {
    const supportTimer = window.setTimeout(() => {
      setSpeechSupported(
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      );
      void refreshMetrics();
    }, 0);

    return () => {
      window.clearTimeout(supportTimer);
      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [refreshMetrics]);

  useEffect(() => {
    if (
      !initialConversationId ||
      restoredConversationIdRef.current === initialConversationId
    ) {
      setRestoringConversation(false);
      return;
    }

    const controller = new AbortController();
    const sessionConversationId = initialConversationId;
    setRestoringConversation(true);
    setConversationNotice(null);

    async function restoreConversation() {
      try {
        const response = await fetch(
          `/api/chat/session?conversationId=${encodeURIComponent(sessionConversationId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("conversation_not_available");
        }

        const data = (await response.json()) as ConversationSessionResponse;
        restoredConversationIdRef.current = data.conversationId;
        setConversationId(data.conversationId);
        setMessages([
          ...initialMessages,
          ...data.messages.map((message) => ({
            ...message,
            emotionLabel: message.emotionLabel ?? undefined,
          })),
        ]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        restoredConversationIdRef.current = null;
        setConversationId(undefined);
        setMessages(initialMessages);
        setConversationNotice(
          "前の会話は終了済みか、読み込めませんでした。新しい会話を始められます。",
        );
        router.replace("/", { scroll: false });
      } finally {
        if (!controller.signal.aborted) {
          setRestoringConversation(false);
        }
      }
    }

    void restoreConversation();
    return () => controller.abort();
  }, [initialConversationId, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!speechEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [speechEnabled]);

  function speak(text: string) {
    if (!speechEnabled || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  const stopListening = useCallback(() => {
    speechHoldActiveRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition || recognitionRef.current) {
      return;
    }

    speechHoldActiveRef.current = true;
    transcriptBaseRef.current = input.trim();
    finalTranscriptRef.current = "";

    const recognition = new Recognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setSpeechMessage("スペースキーを押している間、聞いています");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setSpeechMessage(
        speechHoldActiveRef.current
          ? "音声入力が止まりました。もう一度スペースキーを押してください。"
          : "",
      );
      speechHoldActiveRef.current = false;
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      speechHoldActiveRef.current = false;
      setListening(false);
      setSpeechMessage("音声を聞き取れませんでした。文字でも入力できます。");
    };
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalTranscript = [finalTranscript, transcript].filter(Boolean).join(" ");
        } else {
          interimTranscript = [interimTranscript, transcript]
            .filter(Boolean)
            .join(" ");
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current = [
          finalTranscriptRef.current,
          finalTranscript,
        ]
          .filter(Boolean)
          .join(" ");
      }

      setInput(
        [
          transcriptBaseRef.current,
          finalTranscriptRef.current,
          interimTranscript,
        ]
          .filter(Boolean)
          .join(" "),
      );
      setInputType("speech");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [input]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || conversationBusy) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      startListening();
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      stopListening();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      stopListening();
    };
  }, [conversationBusy, startListening, stopListening]);

  async function submitMessage({
    text,
    displayText = text,
    topicStarter = false,
    topicTitle = null,
    inputType: messageInputType,
    rawContent = text,
  }: {
    text: string;
    displayText?: string;
    topicStarter?: boolean;
    topicTitle?: string | null;
    inputType: MessageInputType;
    rawContent?: string;
  }) {
    if (!text || conversationBusy) {
      return;
    }

    const clientMessageId = createClientId();
    const userMessage: ChatMessage = {
      id: clientMessageId,
      role: "user",
      text: displayText,
      riskLevel: "none",
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setInputType("text");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          conversationId,
          moodScore,
          speechEnabled,
          topicStarter,
          topicTitle,
          rawContent,
          inputType: messageInputType,
          clientMessageId,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        const fallbackMessage: ChatMessage = {
          id: createClientId(),
          role: "assistant",
          text: "すみません、うまく受け取れませんでした。もう一度、短い言葉で送ってみてください。",
          emotionLabel: "neutral",
          riskLevel: "none",
        };
        setMessages((current) => [...current, fallbackMessage]);
        return;
      }

      const data = (await response.json()) as ChatResponse;
      const assistantMessage: ChatMessage = {
        id: createClientId(),
        role: "assistant",
        text: data.reply,
        emotionLabel: data.emotionLabel,
        riskLevel: data.riskLevel,
        debug: data.debug,
      };

      setConversationId(data.conversationId);
      restoredConversationIdRef.current = data.conversationId;
      router.replace(
        `/?conversationId=${encodeURIComponent(data.conversationId)}`,
        { scroll: false },
      );
      setLatestDebug(data.debug ?? null);
      setMessages((current) => [...current, assistantMessage]);
      speak(data.reply);
      void refreshMetrics();
    } catch {
      const fallbackMessage: ChatMessage = {
        id: createClientId(),
        role: "assistant",
        text: "通信がつながりませんでした。少し時間を置いて、また話しかけてください。",
        emotionLabel: "neutral",
        riskLevel: "none",
      };
      setMessages((current) => [...current, fallbackMessage]);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    await submitMessage({
      text: input.trim(),
      rawContent: input,
      inputType,
    });
  }

  async function chooseTopic() {
    if (conversationBusy) {
      return;
    }

    const nextTopic = topics[topicIndex % topics.length];
    setTopicIndex((current) => current + 1);
    setInput("");
    await submitMessage({
      text: `今日の話題: ${nextTopic}`,
      displayText: `今日の話題: ${nextTopic}`,
      topicStarter: true,
      topicTitle: nextTopic,
      inputType: "topic_starter",
    });
  }

  async function endConversation() {
    if (conversationBusy || (!conversationId && messages.length === initialMessages.length)) {
      return;
    }
    if (
      !window.confirm(
        "今日の会話を終えますか？ 会話の記録は残りますが、この画面は新しい会話に切り替わります。",
      )
    ) {
      return;
    }

    setEndingConversation(true);
    setConversationNotice(null);
    try {
      if (conversationId) {
        const response = await fetch("/api/chat/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("conversation_end_failed");
        }
      }

      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      restoredConversationIdRef.current = null;
      setConversationId(undefined);
      setMessages(initialMessages);
      setInput("");
      setInputType("text");
      setMoodScore(null);
      setSpeechMessage("");
      setLatestDebug(null);
      setTopicIndex(0);
      setConversationNotice(
        "今日の会話を記録して終了しました。新しい会話を始められます。",
      );
      router.replace("/", { scroll: false });
      void refreshMetrics();
    } catch {
      setConversationNotice(
        "会話を終了できませんでした。記録を守るため、画面はそのままにしています。もう一度お試しください。",
      );
    } finally {
      setEndingConversation(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#1d2733]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-[#dfe6ee] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-[#3b7f6a]">
              Challenge ATOM
            </p>
            <h1 className="text-3xl font-bold tracking-normal text-[#1b2530] sm:text-4xl">
              そばにいる会話AI
            </h1>
          </div>
          <nav className="flex flex-col gap-3 sm:flex-row" aria-label="主なページ">
            <Link
              href={`/memory${conversationQuery}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#8eb5a6] bg-[#edf7f2] px-5 text-lg font-semibold text-[#285747] shadow-sm transition hover:bg-[#dcefe7]"
            >
              記憶を確認する
            </Link>
            <Link
              href={`/dashboard${conversationQuery}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold text-[#1d2733] shadow-sm transition hover:bg-[#edf4f1]"
            >
              今日の記録を見る
            </Link>
          </nav>
        </header>

        <section className="grid min-h-0 flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex h-[calc(100vh-9rem)] min-h-[620px] flex-col overflow-hidden rounded-lg border border-[#d7e0ea] bg-white shadow-sm">
            {conversationNotice ? (
              <div
                className="border-b border-[#c7d8e8] bg-[#eef5ff] px-4 py-3 text-lg font-semibold text-[#315b83] sm:px-5"
                role="status"
              >
                {conversationNotice}
              </div>
            ) : null}
            {speechMessage ? (
              <div className="border-b border-[#e3e9f0] bg-[#fff8f4] px-4 py-3 sm:px-5">
                <p className="text-lg font-semibold text-[#a04747]">
                  {speechMessage}
                </p>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
              {restoringConversation ? (
                <p className="rounded-lg border border-[#d7e0ea] bg-[#f9fbfd] px-5 py-4 text-xl text-[#405163]">
                  今日の会話を読み込んでいます…
                </p>
              ) : null}
              {messages.map((message) => {
                const isAssistant = message.role === "assistant";

                return (
                  <article
                    key={message.id}
                    className={`flex gap-3 ${
                      isAssistant ? "items-start" : "justify-end"
                    }`}
                  >
                    {isAssistant ? (
                      <PetAvatar mood={getAvatarMood(message)} />
                    ) : null}
                    <div
                      className={`max-w-[82%] rounded-lg px-5 py-4 text-xl leading-8 shadow-sm ${
                        isAssistant
                          ? "border border-[#d5e3dd] bg-[#edf7f2] text-[#1d3a32]"
                          : "bg-[#265d8f] text-white"
                      }`}
                    >
                      <p className="mb-1 text-base font-bold">
                        {isAssistant ? "聞き手" : "あなた"}
                      </p>
                      <p>{message.text}</p>
                      {message.debug ? (
                        <p className="mt-3 border-t border-[#bfd7cc] pt-2 text-sm leading-6 text-[#4d6a60]">
                          制御: {message.debug.usedMock ? "mock" : "OpenAI"} / plan:{" "}
                          {message.debug.planSource ?? "local"} / focus:{" "}
                          {message.debug.mainFocus ?? "なし"} / event:{" "}
                          {message.debug.eventType} / topic:{" "}
                          {message.debug.topicType} / strategy:{" "}
                          {message.debug.listeningStrategy ?? "safety"} / generation:{" "}
                          {message.debug.generationSource}
                          <br />
                          記憶候補: {message.debug.memoryExtraction.status} / 件数:{" "}
                          {message.debug.memoryExtraction.candidateCount} / category:{" "}
                          {message.debug.memoryExtraction.categories.join(", ") || "なし"} / 除外:{" "}
                          {message.debug.memoryExtraction.rejectedCount} / reason:{" "}
                          {message.debug.memoryExtraction.rejectionReasonCodes.join(", ") || "なし"}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {sending ? (
                <article className="flex items-start gap-3">
                  <PetAvatar mood="calm" />
                  <div className="rounded-lg border border-[#d5e3dd] bg-[#edf7f2] px-5 py-4 text-xl text-[#1d3a32]">
                    今のお話を受け止めています
                  </div>
                </article>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={sendMessage}
              className="border-t border-[#dfe6ee] bg-[#f9fbfd] p-4 sm:p-5"
            >
              <label
                htmlFor="message"
                className="mb-2 block text-xl font-bold text-[#1d2733]"
              >
                話したいこと
              </label>
              <textarea
                ref={textareaRef}
                id="message"
                value={input}
                disabled={conversationBusy}
                onChange={(event) => {
                  setInput(event.target.value);
                  setInputType("text");
                }}
                className="min-h-32 w-full resize-none rounded-lg border border-[#b8c6d6] bg-white p-4 text-2xl leading-9 outline-none transition focus:border-[#2f7c68] focus:ring-4 focus:ring-[#cfe8df]"
                placeholder="ここに入力してください"
                maxLength={1000}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onPointerDown={startListening}
                  onPointerUp={stopListening}
                  onPointerCancel={stopListening}
                  onPointerLeave={stopListening}
                  disabled={!speechSupported || conversationBusy}
                  aria-pressed={listening}
                  className={`min-h-14 rounded-lg px-4 text-xl font-bold text-white transition disabled:cursor-not-allowed disabled:bg-[#b8c6d6] ${
                    listening
                      ? "bg-[#a04747]"
                      : "bg-[#3b7f6a] hover:bg-[#326d5a]"
                  }`}
                >
                  {listening ? "聞いています" : "長押しで話す"}
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || conversationBusy}
                  className="min-h-14 rounded-lg bg-[#265d8f] px-4 text-xl font-bold text-white transition hover:bg-[#214f79] disabled:cursor-not-allowed disabled:bg-[#b8c6d6]"
                >
                  送信
                </button>
                <button
                  type="button"
                  onClick={() => setSpeechEnabled((current) => !current)}
                  disabled={restoringConversation || endingConversation}
                  className={`min-h-14 rounded-lg border px-4 text-xl font-bold transition ${
                    speechEnabled
                      ? "border-[#b86b40] bg-[#fff1e8] text-[#7a3d1e]"
                      : "border-[#b8c6d6] bg-white text-[#1d2733]"
                  }`}
                >
                  読み上げ{speechEnabled ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={chooseTopic}
                  disabled={conversationBusy}
                  className="min-h-14 rounded-lg border border-[#b8c6d6] bg-white px-4 text-xl font-bold text-[#1d2733] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  今日の話題
                </button>
              </div>
              {!speechSupported ? (
                <p className="mt-3 text-base text-[#6a4a2f]">
                  このブラウザでは音声入力に未対応です。
                </p>
              ) : null}
            </form>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-bold text-[#1d2733]">
                今日の気分
              </h2>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {moodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMoodScore(option.value)}
                    className={`flex min-h-20 flex-col items-center justify-center rounded-lg border px-2 text-center transition ${
                      moodScore === option.value
                        ? "border-[#2f7c68] bg-[#dff2ea] text-[#1d3a32]"
                        : "border-[#c9d4df] bg-white text-[#405163]"
                    }`}
                  >
                    <span className="text-3xl font-bold">{option.value}</span>
                    <span className="text-sm font-semibold">{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-bold text-[#1d2733]">
                今日の会話
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#eef5ff] p-4">
                  <dt className="text-base font-semibold text-[#405163]">
                    発話数
                  </dt>
                  <dd className="text-3xl font-bold text-[#265d8f]">
                    {metrics?.userMessageCount ?? 0}
                  </dd>
                </div>
                <div className="rounded-lg bg-[#fff4ec] p-4">
                  <dt className="text-base font-semibold text-[#405163]">
                    文字数
                  </dt>
                  <dd className="text-3xl font-bold text-[#9a4f2f]">
                    {metrics?.userCharCount ?? 0}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void endConversation()}
                disabled={
                  conversationBusy ||
                  (!conversationId && messages.length === initialMessages.length)
                }
                className="mt-4 min-h-12 w-full rounded-lg border border-[#b88b6b] bg-[#fff8f2] px-4 text-lg font-bold text-[#805236] transition hover:bg-[#fff0e5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {endingConversation ? "会話を終了しています…" : "今日の会話を終える"}
              </button>
              <p className="mt-2 text-sm leading-6 text-[#596a79]">
                記録は消さず、次に話すときは新しい会話として始めます。
              </p>
            </section>

            {latestDebug ? (
              <section className="rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-bold text-[#1d2733]">
                  会話制御
                </h2>
                <dl className="mt-4 space-y-2 text-base leading-7 text-[#405163]">
                  <div>
                    <dt className="inline font-bold">生成</dt>
                    <dd className="inline">
                      : {latestDebug.usedMock ? "mock" : "OpenAI"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">解析</dt>
                    <dd className="inline">
                      : {latestDebug.planSource ?? "local"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">戦略</dt>
                    <dd className="inline">
                      : {latestDebug.listeningStrategy ?? "safety"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">生成元</dt>
                    <dd className="inline">: {latestDebug.generationSource}</dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">focus</dt>
                    <dd className="inline">
                      : {latestDebug.mainFocus ?? "なし"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">event</dt>
                    <dd className="inline">: {latestDebug.eventType}</dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">topic</dt>
                    <dd className="inline">: {latestDebug.topicType}</dd>
                  </div>
                  <div>
                    <dt className="inline font-bold">question</dt>
                    <dd className="inline">
                      : {latestDebug.shouldAskQuestion ? "yes" : "no"}
                    </dd>
                  </div>
                  {latestDebug.suggestedQuestion ? (
                    <div>
                      <dt className="inline font-bold">ask</dt>
                      <dd className="inline">
                        : {latestDebug.suggestedQuestion}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section className="rounded-lg border border-[#d7e0ea] bg-white p-5 text-lg leading-8 text-[#405163] shadow-sm">
              <h2 className="text-2xl font-bold text-[#1d2733]">
                大切な方針
              </h2>
              <p className="mt-3">
                カメラ、録音保存、ブラウザへの会話保存は使いません。音声入力はスペースキーまたは「長押しで話す」を押している間だけ使います。
              </p>
              <p className="mt-3">
                医療診断はしません。体の急な不調や差し迫った危険がある時は、近くの人や緊急窓口に連絡してください。
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
