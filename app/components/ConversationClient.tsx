"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  EmotionLabel,
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
  mode: string;
  mainFocus: string | null;
  focusTerms: string[];
  eventType: string;
  topicType: string;
  responseGoal: string;
  shouldAskQuestion: boolean;
  topicStarter: boolean;
};

type ChatResponse = {
  reply: string;
  conversationId: string;
  emotionLabel: EmotionLabel;
  riskLevel: RiskLevel;
  usedMock: boolean;
  debug?: ConversationDebug;
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

export default function ConversationClient() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [topicIndex, setTopicIndex] = useState(0);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [latestDebug, setLatestDebug] = useState<ConversationDebug | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechHoldActiveRef = useRef(false);
  const transcriptBaseRef = useRef("");
  const finalTranscriptRef = useRef("");

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
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [input]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || sending) {
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
  }, [sending, startListening, stopListening]);

  async function submitMessage({
    text,
    displayText = text,
    topicStarter = false,
    topicTitle = null,
  }: {
    text: string;
    displayText?: string;
    topicStarter?: boolean;
    topicTitle?: string | null;
  }) {
    if (!text || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createClientId(),
      role: "user",
      text: displayText,
      riskLevel: "none",
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
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

    await submitMessage({ text: input.trim() });
  }

  async function chooseTopic() {
    if (sending) {
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
    });
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
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold text-[#1d2733] shadow-sm transition hover:bg-[#edf4f1]"
          >
            今日の記録を見る
          </Link>
        </header>

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-[#d7e0ea] bg-white shadow-sm">
            {speechMessage ? (
              <div className="border-b border-[#e3e9f0] bg-[#fff8f4] px-4 py-3 sm:px-5">
                <p className="text-lg font-semibold text-[#a04747]">
                  {speechMessage}
                </p>
              </div>
            ) : null}

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
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
                          制御: {message.debug.usedMock ? "mock" : "OpenAI"} / focus:{" "}
                          {message.debug.mainFocus ?? "なし"} / event:{" "}
                          {message.debug.eventType} / topic:{" "}
                          {message.debug.topicType}
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
                onChange={(event) => setInput(event.target.value)}
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
                  disabled={!speechSupported}
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
                  disabled={!input.trim() || sending}
                  className="min-h-14 rounded-lg bg-[#265d8f] px-4 text-xl font-bold text-white transition hover:bg-[#214f79] disabled:cursor-not-allowed disabled:bg-[#b8c6d6]"
                >
                  送信
                </button>
                <button
                  type="button"
                  onClick={() => setSpeechEnabled((current) => !current)}
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
                  className="min-h-14 rounded-lg border border-[#b8c6d6] bg-white px-4 text-xl font-bold text-[#1d2733] transition hover:bg-[#edf4f1]"
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
