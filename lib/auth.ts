import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { getPrismaClient } from "./prisma";

const SESSION_COOKIE = "atom_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;

export type AuthenticatedUser = {
  id: string;
  profileId: string;
  displayName: string;
};

export function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja");
}

function scrypt(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hashHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;

  const actual = await scrypt(password, salt);
  return timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("database_unavailable");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const prisma = getPrismaClient();

  if (token && prisma) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const prisma = getPrismaClient();
  if (!token || !prisma) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          profileId: true,
          profile: { select: { displayName: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return {
    id: session.user.id,
    profileId: session.user.profileId,
    displayName: session.user.profile.displayName,
  };
}
