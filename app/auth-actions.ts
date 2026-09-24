"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  deleteSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { getPrismaClient } from "@/lib/prisma";

export type AuthFormState = { error?: string } | undefined;

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const prisma = getPrismaClient();
  if (!prisma) return { error: "データベースに接続できません。管理者にご連絡ください。" };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const { email, password } = readCredentials(formData);
  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "お名前は1〜50文字で入力してください。" };
  }
  if (!validEmail(email)) {
    return { error: "正しいメールアドレスを入力してください。" };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: "パスワードは8〜128文字で入力してください。" };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: { create: { displayName, consentFamilyShare: false } },
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "このメールアドレスはすでに登録されています。" };
    }
    return { error: "アカウントを作成できませんでした。時間をおいてお試しください。" };
  }

  await createSession(userId);
  redirect("/");
}

export async function login(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const prisma = getPrismaClient();
  if (!prisma) return { error: "データベースに接続できません。管理者にご連絡ください。" };

  const { email, password } = readCredentials(formData);
  if (!validEmail(email) || !password) {
    return { error: "メールアドレスとパスワードをご確認ください。" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
