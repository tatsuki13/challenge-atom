"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  deleteSession,
  hashPassword,
  normalizeName,
  verifyPassword,
} from "@/lib/auth";
import { getPrismaClient } from "@/lib/prisma";

export type AuthFormState = { error?: string } | undefined;

function readCredentials(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return {
    displayName,
    nameKey: normalizeName(displayName),
    birthDateText: String(formData.get("birthDate") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

function parseBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value ?? "";
  const todayInTokyo = `${part("year")}-${part("month")}-${part("day")}`;
  return value >= "1900-01-01" && value <= todayInTokyo ? date : null;
}

export async function signup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { error: "データベースに接続できません。管理者にご連絡ください。" };
  }

  const { displayName, nameKey, birthDateText, password } = readCredentials(formData);
  const birthDate = parseBirthDate(birthDateText);
  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "お名前は1〜50文字で入力してください。" };
  }
  if (!birthDate) {
    return { error: "正しい生年月日を入力してください。" };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: "パスワードは8〜128文字で入力してください。" };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        nameKey,
        birthDate,
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
      return { error: "同じお名前と生年月日のアカウントがすでに登録されています。" };
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
  if (!prisma) {
    return { error: "データベースに接続できません。管理者にご連絡ください。" };
  }

  const { displayName, nameKey, birthDateText, password } = readCredentials(formData);
  const birthDate = parseBirthDate(birthDateText);
  if (!displayName || !birthDate || !password) {
    return { error: "お名前、生年月日、パスワードをご確認ください。" };
  }

  const user = await prisma.user.findUnique({
    where: { nameKey_birthDate: { nameKey, birthDate } },
    select: { id: true, passwordHash: true },
  });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return { error: "入力内容またはパスワードが正しくありません。" };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
