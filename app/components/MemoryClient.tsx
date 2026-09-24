"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MemoryCandidateReviewItem,
} from "@/lib/memoryResolutionService";
import type {
  ManagedMemoryHistoryItem,
  ManagedMemoryItem,
  MemoryManagementRequestView,
} from "@/lib/memoryManagementService";
import type {
  MemoryCategory,
  MemoryPolarity,
  MemoryResolutionAction,
  MemoryTemporalScope,
} from "@/lib/conversationTypes";
import { MAX_REVIEWED_MEMORY_CONTENT_LENGTH } from "@/lib/memoryResolutionRules";

type CandidateResponse = {
  candidates: MemoryCandidateReviewItem[];
};

type MemoryResponse = {
  active: ManagedMemoryItem[];
  archived: ManagedMemoryItem[];
};

type RequestResponse = {
  requests: MemoryManagementRequestView[];
};

type SelectionMode = "UPDATE" | "SUPERSEDE" | null;

const categoryLabels: Record<MemoryCategory, string> = {
  person: "人とのつながり",
  place: "場所",
  experience: "経験・思い出",
  preference: "好み",
  routine: "日課",
  wish: "これからの希望",
};

const polarityLabels: Record<MemoryPolarity, string> = {
  positive: "好き・前向き",
  negative: "苦手・避けたい",
  neutral: "どちらでもない",
};

const temporalLabels: Record<MemoryTemporalScope, string> = {
  past: "過去のこと",
  current: "現在のこと",
  future: "これからのこと",
  timeless: "時期を問わないこと",
  unknown: "時期は未確認",
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getUserFacingError(error: unknown) {
  if (
    error instanceof Error &&
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(error.message)
  ) {
    return error.message;
  }

  return "記憶を保存できませんでした。内容を確認して、もう一度お試しください。";
}

function historyActionLabel(item: ManagedMemoryHistoryItem) {
  if (item.managementActions.some((action) => action.action === "EDIT")) {
    return "内容を修正しました";
  }
  switch (item.resolutionAction) {
    case "UPDATE":
      return "内容を更新しました";
    case "SUPERSEDE":
      return "以前の内容を置き換えました";
    default:
      return "最初に覚えました";
  }
}

function EvidenceList({ evidence }: { evidence: { id: string; content: string }[] }) {
  if (evidence.length === 0) {
    return <p className="text-base text-[#687786]">根拠となった発言は確認できません。</p>;
  }

  return (
    <div className="space-y-2">
      {evidence.map((message) => (
        <blockquote
          key={message.id}
          className="break-words rounded-lg border-l-4 border-[#6ba58f] bg-[#edf7f2] px-4 py-3 text-lg leading-7 text-[#25483e]"
        >
          「{message.content}」
        </blockquote>
      ))}
    </div>
  );
}

function MemoryBadges({
  category,
  polarity,
  temporalScope,
}: {
  category: MemoryCategory;
  polarity: MemoryPolarity;
  temporalScope: MemoryTemporalScope;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm font-semibold">
      <span className="rounded-full bg-[#e8eef6] px-3 py-1 text-[#315b83]">
        {categoryLabels[category]}
      </span>
      <span className="rounded-full bg-[#f7eee8] px-3 py-1 text-[#895033]">
        {polarityLabels[polarity]}
      </span>
      <span className="rounded-full bg-[#edf4f1] px-3 py-1 text-[#3b6e5e]">
        {temporalLabels[temporalScope]}
      </span>
    </div>
  );
}

function UsageList({ usages }: { usages: ManagedMemoryHistoryItem["usages"] }) {
  if (usages.length === 0) {
    return <p className="mt-2 text-base text-[#687786]">会話で利用した履歴はありません。</p>;
  }
  return (
    <ol className="mt-3 space-y-3">
      {usages.map((usage, index) => (
        <li key={`${new Date(usage.createdAt).toISOString()}-${index}`} className="rounded-lg border border-[#dce4eb] bg-white p-3">
          <p className="text-sm text-[#687786]">{formatDate(usage.createdAt)}・関連度 {usage.retrievalScore}</p>
          <p className="mt-1 text-base font-semibold text-[#405163]">AIの返答</p>
          <p className="mt-1 break-words text-base leading-7">{usage.assistantReply}</p>
          <p className="mt-2 text-sm text-[#596a79]">利用理由: {usage.usageReason}</p>
        </li>
      ))}
    </ol>
  );
}

function HistoryEntry({ item }: { item: ManagedMemoryHistoryItem }) {
  return (
    <li className="border-l-2 border-[#c9d5df] pl-4">
      <p className="font-semibold text-[#405163]">{historyActionLabel(item)}</p>
      <p className="mt-1 text-lg leading-7">{item.memory.content}</p>
      <p className="mt-1 text-sm text-[#687786]">
        {formatDate(item.memory.updatedAt)}
      </p>
      {item.candidateContent && item.candidateContent !== item.memory.content ? (
        <p className="mt-2 text-base text-[#596a79]">
          確認前の候補: {item.candidateContent}
        </p>
      ) : null}
      <div className="mt-3">
        <EvidenceList evidence={item.evidence} />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer font-semibold text-[#315b83]">この内容を会話で使った履歴（{item.usages.length}件）</summary>
        <UsageList usages={item.usages} />
      </details>
    </li>
  );
}

export default function MemoryClient({
  conversationId,
}: {
  conversationId?: string;
}) {
  const [candidates, setCandidates] = useState<MemoryCandidateReviewItem[]>([]);
  const [memories, setMemories] = useState<ManagedMemoryItem[]>([]);
  const [archivedMemories, setArchivedMemories] = useState<ManagedMemoryItem[]>([]);
  const [managementRequests, setManagementRequests] = useState<MemoryManagementRequestView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectionModes, setSelectionModes] = useState<Record<string, SelectionMode>>({});
  const [targetIds, setTargetIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, string>>({});
  const [requestTargetIds, setRequestTargetIds] = useState<Record<string, string>>({});
  const [requestDrafts, setRequestDrafts] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  const requestKeys = useRef(new Map<string, string>());
  const conversationQuery = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : "";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [candidateResponse, memoryResponse, requestResponse] = await Promise.all([
        fetch("/api/memory/candidates", { cache: "no-store" }),
        fetch("/api/memory", { cache: "no-store" }),
        fetch("/api/memory/requests", { cache: "no-store" }),
      ]);
      if (!candidateResponse.ok || !memoryResponse.ok || !requestResponse.ok) {
        throw new Error("memory_load_failed");
      }

      const candidateData = (await candidateResponse.json()) as CandidateResponse;
      const memoryData = (await memoryResponse.json()) as MemoryResponse;
      const requestData = (await requestResponse.json()) as RequestResponse;
      setCandidates(candidateData.candidates);
      setMemories(memoryData.active);
      setArchivedMemories(memoryData.archived);
      setManagementRequests(requestData.requests);
      setDrafts((current) => {
        const next: Record<string, string> = {};
        for (const item of candidateData.candidates) {
          next[item.candidate.id] = current[item.candidate.id] ?? item.candidate.content;
        }
        return next;
      });
      setMemoryDrafts((current) => {
        const next = { ...current };
        for (const item of [...memoryData.active, ...memoryData.archived]) {
          next[item.memory.id] ??= item.memory.content;
        }
        return next;
      });
      setRequestTargetIds((current) => {
        const next = { ...current };
        for (const item of requestData.requests) {
          if (!next[item.request.id] && item.matches.length === 1) {
            next[item.request.id] = item.matches[0].id;
          }
        }
        return next;
      });
      setRequestDrafts((current) => {
        const next = { ...current };
        for (const item of requestData.requests) {
          next[item.request.id] ??= item.request.correctedContent ?? item.matches[0]?.content ?? "";
        }
        return next;
      });
    } catch {
      setError("記憶の情報を読み込めませんでした。通信を確認して、もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const groupedMemories = useMemo(() => {
    const groups = new Map<MemoryCategory, ManagedMemoryItem[]>();
    for (const item of memories) {
      const group = groups.get(item.memory.category) ?? [];
      group.push(item);
      groups.set(item.memory.category, group);
    }
    return [...groups.entries()];
  }, [memories]);

  async function submitResolution({
    item,
    action,
    targetMemoryId,
    reasonCode,
  }: {
    item: MemoryCandidateReviewItem;
    action: MemoryResolutionAction;
    targetMemoryId?: string;
    reasonCode:
      | "new_memory"
      | "exact_duplicate"
      | "content_update"
      | "explicit_replacement"
      | "user_rejected";
  }) {
    if (submittingId) return;

    const reviewedContent = drafts[item.candidate.id] ?? item.candidate.content;
    if (!reviewedContent.trim()) {
      setError("記憶する文章を入力してください。");
      return;
    }
    if (reviewedContent.trim().length > MAX_REVIEWED_MEMORY_CONTENT_LENGTH) {
      setError(`記憶する文章は${MAX_REVIEWED_MEMORY_CONTENT_LENGTH}文字以内で入力してください。`);
      return;
    }
    if ((action === "UPDATE" || action === "SUPERSEDE") && !targetMemoryId) {
      setError("変更する以前の記憶を選んでください。");
      return;
    }

    if (
      action === "IGNORE" &&
      !window.confirm("この候補は保存しません。よろしいですか？")
    ) {
      return;
    }
    if (
      action === "SUPERSEDE" &&
      !window.confirm("選んだ以前の記憶を履歴に残し、新しい内容へ置き換えます。よろしいですか？")
    ) {
      return;
    }

    setSubmittingId(item.candidate.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/memory/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          candidateId: item.candidate.id,
          action,
          actor: "user",
          reasonCode,
          reviewedContent,
          ...(targetMemoryId ? { targetMemoryId } : {}),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        outcome?: "resolved" | "already_resolved";
        message?: string;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? result.error ?? "memory_resolution_failed");
      }

      setCandidates((current) =>
        current.filter((candidate) => candidate.candidate.id !== item.candidate.id),
      );
      setNotice(
        result.outcome === "already_resolved"
          ? "この候補はすでに確認済みでした。表示を更新しました。"
          : action === "IGNORE"
            ? "この候補は保存しませんでした。"
            : "記憶を保存しました。",
      );
      setSelectionModes((current) => ({ ...current, [item.candidate.id]: null }));
      await loadData();
    } catch (submissionError) {
      setError(getUserFacingError(submissionError));
    } finally {
      setSubmittingId(null);
    }
  }

  async function submitMemoryManagement(
    item: ManagedMemoryItem,
    action: "EDIT" | "ARCHIVE" | "RESTORE",
  ) {
    if (submittingId) return;
    const operationKey = `${action}:${item.memory.id}`;
    if (action === "ARCHIVE" && !window.confirm("この内容を記憶から外します。履歴は残り、完全削除ではありません。よろしいですか？")) {
      return;
    }
    const reviewedContent = memoryDrafts[item.memory.id] ?? item.memory.content;
    if (action === "EDIT" && !reviewedContent.trim()) {
      setError("修正後の文章を入力してください。");
      return;
    }
    setSubmittingId(operationKey);
    setError(null);
    setNotice(null);
    const requestKey = requestKeys.current.get(operationKey) ?? crypto.randomUUID();
    requestKeys.current.set(operationKey, requestKey);
    try {
      const response = await fetch("/api/memory/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          requestKey,
          memoryId: item.memory.id,
          action,
          actor: "user",
          reasonCode:
            action === "EDIT"
              ? "user_edit"
              : action === "ARCHIVE"
                ? "user_archive"
                : "user_restore",
          ...(action === "EDIT" ? { reviewedContent } : {}),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        reasonCode?: string;
      };
      if (!response.ok || !result.ok) {
        if (result.reasonCode === "active_successor") {
          throw new Error("この内容には、現在使われている新しい内容があります。新しい内容を優先するため、記憶には戻せません。");
        }
        if (result.reasonCode === "invalid_status") {
          throw new Error("この記憶はすでに変更されています。再読み込みして状態をご確認ください。");
        }
        throw new Error(result.message ?? result.error ?? "memory_management_failed");
      }
      requestKeys.current.delete(operationKey);
      setEditingMemoryId(null);
      setNotice(
        action === "EDIT"
          ? "記憶の内容を修正しました。以前の内容は履歴に残っています。"
          : action === "ARCHIVE"
            ? "記憶から外しました。会話では使われません。"
            : "もう一度、記憶に戻しました。",
      );
      await loadData();
    } catch (submissionError) {
      setError(getUserFacingError(submissionError));
    } finally {
      setSubmittingId(null);
    }
  }

  async function submitManagementRequest(
    item: MemoryManagementRequestView,
    approve: boolean,
  ) {
    if (submittingId) return;
    const selectedMemoryId = requestTargetIds[item.request.id];
    if (approve && !selectedMemoryId) {
      setError("変更する記憶を選んでください。対象がない場合は『今回は変更しない』を選んでください。");
      return;
    }
    const correctedContent = requestDrafts[item.request.id] ?? "";
    if (
      approve &&
      item.request.intent === "CORRECT" &&
      (!correctedContent.trim() || correctedContent.trim().length > MAX_REVIEWED_MEMORY_CONTENT_LENGTH)
    ) {
      setError(`修正後の文章を1〜${MAX_REVIEWED_MEMORY_CONTENT_LENGTH}文字で入力してください。`);
      return;
    }
    if (
      approve &&
      item.request.intent === "FORGET" &&
      !window.confirm("選んだ内容を記憶から外します。履歴は残ります。よろしいですか？")
    ) {
      return;
    }
    const key = `request:${item.request.id}`;
    setSubmittingId(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/memory/requests/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          requestId: item.request.id,
          approve,
          ...(selectedMemoryId ? { selectedMemoryId } : {}),
          ...(approve && item.request.intent === "CORRECT"
              ? { reviewedContent: correctedContent }
            : {}),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? result.error ?? "request_resolution_failed");
      }
      setNotice(approve ? "会話中のお願いを確認して反映しました。" : "今回は記憶を変更しませんでした。");
      await loadData();
    } catch (submissionError) {
      setError(getUserFacingError(submissionError));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <main className="memory-page min-h-screen overflow-x-hidden bg-[#f6f8fb] px-4 py-5 text-[#1d2733] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-[#dfe6ee] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold text-[#3b7f6a]">Challenge ATOM</p>
            <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">記憶</h1>
            <p className="mt-2 break-words text-lg text-[#536575]">
              会話から見つけた大切なことを、確認してから覚えます。
            </p>
          </div>
          <nav className="flex flex-col gap-3 sm:flex-row" aria-label="主なページ">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading || Boolean(submittingId)}
              className="min-h-12 rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              再読み込み
            </button>
            <Link
              href={`/dashboard${conversationQuery}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold transition hover:bg-[#edf4f1]"
            >
              今日の記録
            </Link>
            <Link
              href={`/${conversationQuery}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#265d8f] px-5 text-lg font-semibold text-white transition hover:bg-[#214f79]"
            >
              会話に戻る
            </Link>
          </nav>
        </header>

        <div aria-live="polite" className="mt-5 space-y-3">
          {notice ? (
            <p className="rounded-lg border border-[#9bc5b4] bg-[#edf7f2] px-5 py-4 text-lg font-semibold text-[#285747]">
              {notice}
            </p>
          ) : null}
          {error ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[#d8aaaa] bg-[#fff4f2] px-5 py-4 text-lg text-[#7a3030] sm:flex-row sm:items-center sm:justify-between">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadData()}
                className="min-h-11 rounded-lg border border-[#c78686] bg-white px-4 font-semibold"
              >
                もう一度読み込む
              </button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-5 rounded-lg border border-[#d7e0ea] bg-white p-5 text-xl shadow-sm">
            記憶を読み込んでいます
          </p>
        ) : (
          <div className="grid min-w-0 gap-6 py-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start">
            <section className="min-w-0" aria-labelledby="pending-memory-heading">
              <div className="mb-4">
                <h2 id="pending-memory-heading" className="text-2xl font-bold">
                  確認待ち
                </h2>
                <p className="mt-1 text-lg text-[#596a79]">
                  覚えてよい内容か、一つずつ確認してください。
                </p>
              </div>

              {managementRequests.length > 0 ? (
                <div className="mb-6 space-y-4" aria-label="会話中の記憶変更のお願い">
                  <h3 className="text-xl font-bold text-[#805236]">会話中に受け取ったお願い</h3>
                  {managementRequests.map((item) => {
                    const requestId = item.request.id;
                    const isCorrection = item.request.intent === "CORRECT";
                    const isSubmitting = submittingId === `request:${requestId}`;
                    return (
                      <article key={requestId} className="rounded-lg border border-[#e0c9b7] bg-[#fffaf5] p-5 shadow-sm">
                        <p className="text-lg font-bold text-[#76513a]">
                          {isCorrection ? "記憶を直したいというお願い" : "記憶から外したいというお願い"}
                        </p>
                        <blockquote className="mt-3 rounded-lg border-l-4 border-[#b88b6b] bg-white px-4 py-3 text-lg leading-7">
                          「{item.sourceMessage.content}」
                        </blockquote>
                        {item.matches.length === 0 ? (
                          <p className="mt-4 rounded-lg bg-[#fff0ed] p-3 text-base text-[#7a3030]">
                            対象の記憶を特定できませんでした。誤って変更しないため、自動では処理していません。
                          </p>
                        ) : (
                          <>
                            <label className="mt-4 block text-base font-bold" htmlFor={`request-target-${requestId}`}>
                              対象の記憶を選ぶ
                            </label>
                            <select
                              id={`request-target-${requestId}`}
                              value={requestTargetIds[requestId] ?? ""}
                              disabled={Boolean(submittingId)}
                              onChange={(event) => setRequestTargetIds((current) => ({ ...current, [requestId]: event.target.value }))}
                              className="mt-2 min-h-14 w-full rounded-lg border border-[#aebdcc] bg-white px-4 text-lg"
                            >
                              <option value="">選んでください</option>
                              {item.matches.map((memory) => (
                                <option key={memory.id} value={memory.id}>{memory.content}</option>
                              ))}
                            </select>
                          </>
                        )}
                        {isCorrection ? (
                          <>
                            <label className="mt-4 block text-base font-bold" htmlFor={`request-content-${requestId}`}>
                              修正後の文章
                            </label>
                            <textarea
                              id={`request-content-${requestId}`}
                              value={requestDrafts[requestId] ?? ""}
                              maxLength={MAX_REVIEWED_MEMORY_CONTENT_LENGTH}
                              rows={3}
                              disabled={Boolean(submittingId)}
                              onChange={(event) => setRequestDrafts((current) => ({ ...current, [requestId]: event.target.value }))}
                              className="mt-2 w-full resize-y rounded-lg border border-[#aebdcc] bg-white px-4 py-3 text-lg leading-7"
                            />
                          </>
                        ) : null}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            disabled={Boolean(submittingId) || item.matches.length === 0}
                            onClick={() => void submitManagementRequest(item, true)}
                            className="min-h-12 rounded-lg bg-[#3b7f6a] px-5 text-lg font-bold text-white disabled:opacity-50"
                          >
                            {isSubmitting ? "確認しています" : isCorrection ? "選んだ記憶を修正する" : "選んだ記憶から外す"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(submittingId)}
                            onClick={() => void submitManagementRequest(item, false)}
                            className="min-h-12 rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold"
                          >
                            今回は変更しない
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {candidates.length === 0 && managementRequests.length === 0 ? (
                <div className="rounded-lg border border-[#d7e0ea] bg-white p-6 text-lg leading-8 shadow-sm">
                  <p className="text-xl font-semibold">確認待ちの内容はありません。</p>
                  <p className="mt-2 text-[#596a79]">
                    会話から候補が見つかると、ここに表示されます。
                  </p>
                </div>
              ) : candidates.length > 0 ? (
                <div className="space-y-5">
                  {candidates.map((item) => {
                    const candidate = item.candidate;
                    const draft = drafts[candidate.id] ?? candidate.content;
                    const mode = selectionModes[candidate.id] ?? null;
                    const isSubmitting = submittingId === candidate.id;
                    const anySubmitting = Boolean(submittingId);
                    const exactOriginalDuplicate =
                      Boolean(item.exactDuplicateMemoryId) && draft.trim() === candidate.content;

                    return (
                      <article
                        key={candidate.id}
                        className="min-w-0 overflow-hidden rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm sm:p-6"
                      >
                        <MemoryBadges
                          category={candidate.category}
                          polarity={candidate.polarity}
                          temporalScope={candidate.temporalScope}
                        />

                        <label className="mt-5 block text-lg font-bold" htmlFor={`memory-${candidate.id}`}>
                          覚えておく文章
                        </label>
                        <textarea
                          id={`memory-${candidate.id}`}
                          value={draft}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [candidate.id]: event.target.value,
                            }))
                          }
                          maxLength={MAX_REVIEWED_MEMORY_CONTENT_LENGTH}
                          disabled={anySubmitting}
                          rows={3}
                          className="mt-2 w-full max-w-full resize-y rounded-lg border border-[#aebdcc] bg-[#fbfcfe] px-4 py-3 text-xl leading-8 outline-none transition focus:border-[#3b7f6a] focus:ring-2 focus:ring-[#b9dacd] disabled:opacity-60"
                        />
                        <p className="mt-1 text-right text-sm text-[#687786]">
                          {draft.trim().length} / {MAX_REVIEWED_MEMORY_CONTENT_LENGTH}文字
                        </p>

                        <div className="mt-4">
                          <p className="mb-2 text-base font-bold text-[#536575]">もとになった発言</p>
                          <EvidenceList evidence={item.evidence} />
                        </div>

                        {item.comparisonMemories.length > 0 ? (
                          <div className="mt-4 rounded-lg border border-[#e0d4c8] bg-[#fffaf5] p-4">
                            <p className="font-bold text-[#76513a]">似た記憶があります</p>
                            <ul className="mt-2 space-y-1 text-base text-[#644c3d]">
                              {item.comparisonMemories.map((memory) => (
                                <li key={memory.id}>・{memory.content}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {exactOriginalDuplicate ? (
                          <div className="mt-5 rounded-lg border border-[#b9d5ca] bg-[#f1f8f5] p-4">
                            <p className="text-lg font-semibold text-[#315f50]">
                              同じ内容をすでに覚えています。
                            </p>
                            <button
                              type="button"
                              disabled={anySubmitting}
                              onClick={() =>
                                void submitResolution({
                                  item,
                                  action: "IGNORE",
                                  reasonCode: "exact_duplicate",
                                })
                              }
                              className="mt-3 min-h-12 rounded-lg bg-[#3b7f6a] px-5 text-lg font-semibold text-white disabled:opacity-60"
                            >
                              {isSubmitting ? "確認しています" : "同じ内容として確認済みにする"}
                            </button>
                          </div>
                        ) : (
                          <div className="mt-5 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <button
                                type="button"
                                disabled={anySubmitting}
                                onClick={() =>
                                  void submitResolution({
                                    item,
                                    action: "ADD",
                                    reasonCode: "new_memory",
                                  })
                                }
                                className="min-h-14 rounded-lg bg-[#3b7f6a] px-4 text-lg font-bold text-white transition hover:bg-[#326d5b] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmitting ? "保存しています" : "新しく覚えておく"}
                              </button>
                              <button
                                type="button"
                                disabled={anySubmitting || memories.length === 0}
                                onClick={() =>
                                  setSelectionModes((current) => ({
                                    ...current,
                                    [candidate.id]: "UPDATE",
                                  }))
                                }
                                className="min-h-14 rounded-lg border border-[#6f93b4] bg-[#f3f7fb] px-4 text-lg font-bold text-[#28597f] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                この記憶を更新する
                              </button>
                              <button
                                type="button"
                                disabled={anySubmitting || memories.length === 0}
                                onClick={() =>
                                  setSelectionModes((current) => ({
                                    ...current,
                                    [candidate.id]: "SUPERSEDE",
                                  }))
                                }
                                className="min-h-14 rounded-lg border border-[#b88b6b] bg-[#fff8f2] px-4 text-lg font-bold text-[#805236] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                以前の記憶と置き換える
                              </button>
                              <button
                                type="button"
                                disabled={anySubmitting}
                                onClick={() =>
                                  void submitResolution({
                                    item,
                                    action: "IGNORE",
                                    reasonCode: "user_rejected",
                                  })
                                }
                                className="min-h-14 rounded-lg border border-[#b8c6d6] bg-white px-4 text-lg font-bold text-[#536575] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                保存しない
                              </button>
                            </div>
                            <p className="text-base leading-6 text-[#687786]">
                              更新や置き換えでは、変更する以前の記憶を自分で選びます。
                            </p>
                          </div>
                        )}

                        {mode ? (
                          <div className="mt-5 rounded-lg border border-[#c8d4df] bg-[#f7f9fc] p-4">
                            <label className="block text-lg font-bold" htmlFor={`target-${candidate.id}`}>
                              {mode === "UPDATE"
                                ? "内容を更新する記憶を選ぶ"
                                : "置き換える以前の記憶を選ぶ"}
                            </label>
                            <select
                              id={`target-${candidate.id}`}
                              value={targetIds[candidate.id] ?? ""}
                              disabled={anySubmitting}
                              onChange={(event) =>
                                setTargetIds((current) => ({
                                  ...current,
                                  [candidate.id]: event.target.value,
                                }))
                              }
                              className="mt-2 min-h-14 w-full max-w-full rounded-lg border border-[#aebdcc] bg-white px-4 text-lg"
                            >
                              <option value="">選んでください</option>
                              {memories.map((memory) => (
                                <option key={memory.memory.id} value={memory.memory.id}>
                                  {categoryLabels[memory.memory.category]}：{memory.memory.content}
                                </option>
                              ))}
                            </select>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                disabled={anySubmitting || !targetIds[candidate.id]}
                                onClick={() =>
                                  void submitResolution({
                                    item,
                                    action: mode,
                                    targetMemoryId: targetIds[candidate.id],
                                    reasonCode:
                                      mode === "UPDATE"
                                        ? "content_update"
                                        : "explicit_replacement",
                                  })
                                }
                                className="min-h-12 rounded-lg bg-[#265d8f] px-5 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isSubmitting
                                  ? "保存しています"
                                  : mode === "UPDATE"
                                    ? "選んだ記憶を更新する"
                                    : "選んだ記憶を置き換える"}
                              </button>
                              <button
                                type="button"
                                disabled={anySubmitting}
                                onClick={() =>
                                  setSelectionModes((current) => ({
                                    ...current,
                                    [candidate.id]: null,
                                  }))
                                }
                                className="min-h-12 rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold"
                              >
                                戻る
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="min-w-0" aria-labelledby="active-memory-heading">
              <div className="mb-4">
                <h2 id="active-memory-heading" className="text-2xl font-bold">
                  覚えていること
                </h2>
                <p className="mt-1 text-lg text-[#596a79]">
                  現在覚えている内容です。以前の内容は履歴から確認できます。
                </p>
              </div>

              {memories.length === 0 ? (
                <div className="rounded-lg border border-[#d7e0ea] bg-white p-6 text-lg leading-8 shadow-sm">
                  <p className="text-xl font-semibold">まだ覚えていることはありません。</p>
                  <p className="mt-2 text-[#596a79]">
                    確認待ちの内容を保存すると、ここに表示されます。
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedMemories.map(([category, items]) => (
                    <section key={category} aria-labelledby={`category-${category}`}>
                      <h3 id={`category-${category}`} className="mb-3 text-xl font-bold text-[#315f50]">
                        {categoryLabels[category]}
                      </h3>
                      <div className="space-y-4">
                        {items.map((item) => (
                          <article
                            key={item.memory.id}
                            className="min-w-0 overflow-hidden rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm"
                          >
                            <MemoryBadges
                              category={item.memory.category}
                              polarity={item.memory.polarity}
                              temporalScope={item.memory.temporalScope}
                            />
                            <p className="mt-4 break-words text-xl font-bold leading-8">{item.memory.content}</p>
                            <p className="mt-2 text-sm text-[#687786]">
                              更新日: {formatDate(item.memory.updatedAt)}
                            </p>

                            {item.candidateContent &&
                            item.candidateContent !== item.memory.content ? (
                              <p className="mt-3 rounded-lg bg-[#f5f7f9] px-4 py-3 text-base text-[#596a79]">
                                確認前の候補: {item.candidateContent}
                              </p>
                            ) : null}

                            <div className="mt-4">
                              <p className="mb-2 text-base font-bold text-[#536575]">もとになった発言</p>
                              <EvidenceList evidence={item.evidence} />
                            </div>

                            {editingMemoryId === item.memory.id ? (
                              <div className="mt-4 rounded-lg border border-[#b9d5ca] bg-[#f1f8f5] p-4">
                                <label className="block text-lg font-bold" htmlFor={`edit-memory-${item.memory.id}`}>
                                  修正後の文章
                                </label>
                                <textarea
                                  id={`edit-memory-${item.memory.id}`}
                                  value={memoryDrafts[item.memory.id] ?? item.memory.content}
                                  maxLength={MAX_REVIEWED_MEMORY_CONTENT_LENGTH}
                                  rows={3}
                                  disabled={Boolean(submittingId)}
                                  onChange={(event) => setMemoryDrafts((current) => ({ ...current, [item.memory.id]: event.target.value }))}
                                  className="mt-2 w-full resize-y rounded-lg border border-[#aebdcc] bg-white px-4 py-3 text-lg leading-7"
                                />
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                  <button
                                    type="button"
                                    disabled={Boolean(submittingId)}
                                    onClick={() => void submitMemoryManagement(item, "EDIT")}
                                    className="min-h-12 rounded-lg bg-[#3b7f6a] px-5 text-lg font-bold text-white disabled:opacity-50"
                                  >
                                    {submittingId === `EDIT:${item.memory.id}` ? "保存しています" : "修正内容を保存する"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={Boolean(submittingId)}
                                    onClick={() => setEditingMemoryId(null)}
                                    className="min-h-12 rounded-lg border border-[#b8c6d6] bg-white px-5 text-lg font-semibold"
                                  >
                                    戻る
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <button
                                  type="button"
                                  disabled={Boolean(submittingId)}
                                  onClick={() => setEditingMemoryId(item.memory.id)}
                                  className="min-h-12 rounded-lg border border-[#6f93b4] bg-[#f3f7fb] px-4 text-lg font-bold text-[#28597f] disabled:opacity-50"
                                >
                                  内容を修正する
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(submittingId)}
                                  onClick={() => void submitMemoryManagement(item, "ARCHIVE")}
                                  className="min-h-12 rounded-lg border border-[#b88b6b] bg-[#fff8f2] px-4 text-lg font-bold text-[#805236] disabled:opacity-50"
                                >
                                  {submittingId === `ARCHIVE:${item.memory.id}` ? "処理しています" : "記憶から外す"}
                                </button>
                              </div>
                            )}

                            <details className="mt-4 rounded-lg border border-[#dce4eb] bg-[#fafbfd] p-4">
                              <summary className="cursor-pointer text-lg font-bold text-[#315b83]">
                                会話で使った履歴を見る（{item.usages.length}件）
                              </summary>
                              <UsageList usages={item.usages} />
                            </details>

                            {item.history.length > 0 ? (
                              <details className="mt-4 rounded-lg border border-[#dce4eb] bg-[#fafbfd] p-4">
                                <summary className="cursor-pointer text-lg font-bold text-[#315b83]">
                                  以前の内容を見る（{item.history.length}件）
                                </summary>
                                <ol className="mt-4 space-y-5">
                                  {item.history.map((historyItem) => (
                                    <HistoryEntry key={historyItem.memory.id} item={historyItem} />
                                  ))}
                                </ol>
                              </details>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <div className="mt-8 border-t border-[#d7e0ea] pt-5">
                <button
                  type="button"
                  onClick={() => setShowArchived((current) => !current)}
                  className="min-h-12 w-full rounded-lg border border-[#aebdcc] bg-white px-5 text-left text-lg font-bold text-[#405163]"
                  aria-expanded={showArchived}
                >
                  {showArchived ? "記憶から外した内容を閉じる" : `記憶から外した内容を見る（${archivedMemories.length}件）`}
                </button>

                {showArchived ? (
                  <div className="mt-4 space-y-4">
                    <p className="text-base leading-7 text-[#596a79]">
                      ここにある内容は履歴として残っていますが、会話には使われません。
                    </p>
                    {archivedMemories.length === 0 ? (
                      <p className="rounded-lg border border-[#d7e0ea] bg-white p-5 text-lg">
                        記憶から外した内容はありません。
                      </p>
                    ) : (
                      archivedMemories.map((item) => (
                        <article
                          key={item.memory.id}
                          className="min-w-0 overflow-hidden rounded-lg border border-[#d7e0ea] bg-white p-5 shadow-sm"
                        >
                          <MemoryBadges
                            category={item.memory.category}
                            polarity={item.memory.polarity}
                            temporalScope={item.memory.temporalScope}
                          />
                          <p className="mt-4 break-words text-xl font-bold leading-8">{item.memory.content}</p>
                          <p className="mt-2 text-sm text-[#687786]">
                            記憶から外した内容・更新日: {formatDate(item.memory.updatedAt)}
                          </p>
                          <button
                            type="button"
                            disabled={Boolean(submittingId)}
                            onClick={() => void submitMemoryManagement(item, "RESTORE")}
                            className="mt-4 min-h-12 w-full rounded-lg border border-[#6f93b4] bg-[#f3f7fb] px-4 text-lg font-bold text-[#28597f] disabled:opacity-50"
                          >
                            {submittingId === `RESTORE:${item.memory.id}` ? "処理しています" : "もう一度、記憶に戻す"}
                          </button>
                          <details className="mt-4 rounded-lg border border-[#dce4eb] bg-[#fafbfd] p-4">
                            <summary className="cursor-pointer text-lg font-bold text-[#315b83]">
                              会話で使った履歴を見る（{item.usages.length}件）
                            </summary>
                            <UsageList usages={item.usages} />
                          </details>
                          {item.history.length > 0 ? (
                            <details className="mt-4 rounded-lg border border-[#dce4eb] bg-[#fafbfd] p-4">
                              <summary className="cursor-pointer text-lg font-bold text-[#315b83]">
                                以前の内容を見る（{item.history.length}件）
                              </summary>
                              <ol className="mt-4 space-y-5">
                                {item.history.map((historyItem) => (
                                  <HistoryEntry key={historyItem.memory.id} item={historyItem} />
                                ))}
                              </ol>
                            </details>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
