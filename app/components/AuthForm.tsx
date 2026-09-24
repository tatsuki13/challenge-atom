"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "../auth-actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
};

export default function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const signupMode = mode === "signup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-10 text-[#1d2733]">
      <section className="w-full max-w-md rounded-2xl border border-[#d8e3de] bg-white p-7 shadow-lg sm:p-9">
        <p className="text-sm font-bold tracking-[0.18em] text-[#3b7f6a]">CHALLENGE ATOM</p>
        <h1 className="mt-3 text-3xl font-bold">{signupMode ? "アカウント作成" : "ログイン"}</h1>
        <p className="mt-3 leading-7 text-[#596a79]">
          {signupMode
            ? "あなた専用の会話と記憶を安全に分けて保存します。"
            : "登録したアカウントで続きから利用できます。"}
        </p>

        <form action={formAction} className="mt-7 space-y-5">
          {signupMode ? (
            <label className="block font-bold">
              お名前
              <input
                name="displayName"
                autoComplete="name"
                maxLength={50}
                required
                className="mt-2 min-h-12 w-full rounded-lg border border-[#aebdcc] px-4 text-lg font-normal"
              />
            </label>
          ) : null}
          <label className="block font-bold">
            メールアドレス
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              className="mt-2 min-h-12 w-full rounded-lg border border-[#aebdcc] px-4 text-lg font-normal"
            />
          </label>
          <label className="block font-bold">
            パスワード
            <input
              name="password"
              type="password"
              autoComplete={signupMode ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              className="mt-2 min-h-12 w-full rounded-lg border border-[#aebdcc] px-4 text-lg font-normal"
            />
            {signupMode ? <span className="mt-1 block text-sm font-normal text-[#687786]">8文字以上</span> : null}
          </label>

          {state?.error ? (
            <p role="alert" className="rounded-lg bg-[#fff0f0] px-4 py-3 font-semibold text-[#963e3e]">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="min-h-13 w-full rounded-lg bg-[#2f7460] px-5 text-lg font-bold text-white transition hover:bg-[#285f50] disabled:opacity-60"
          >
            {pending ? "処理しています…" : signupMode ? "登録して始める" : "ログイン"}
          </button>
        </form>

        <p className="mt-6 text-center text-[#596a79]">
          {signupMode ? "すでにアカウントをお持ちですか？" : "初めて利用しますか？"}{" "}
          <Link href={signupMode ? "/login" : "/signup"} className="font-bold text-[#265d8f] underline">
            {signupMode ? "ログイン" : "アカウント作成"}
          </Link>
        </p>
      </section>
    </main>
  );
}
