import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getPrismaClient } from "./prisma";
import { addUtcDays, dateKeyToUtcDate, getTokyoDateKey } from "./date";
import { savePhysicalSignals } from "./healthSamples";
import { parseGoogleHealthSample } from "./googleHealthParsing";

const scopes = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
];
const apiBase = "https://health.googleapis.com/v4/users/me/dataTypes";

export function getGoogleHealthConfig() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI?.trim();
  const key = process.env.GOOGLE_HEALTH_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !key || !/^https?:\/\//.test(redirectUri)) return null;
  const keyBytes = Buffer.from(key, "base64");
  if (keyBytes.length !== 32) return null;
  return { clientId, clientSecret, redirectUri, keyBytes };
}

function encrypt(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decrypt(value: string, key: Buffer) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("invalid_encrypted_token");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(parameters: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`google_token_${response.status}`);
  const result = await response.json() as TokenResponse;
  if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Error("invalid_google_token");
  return result;
}

export function getAuthorizationUrl(state: string) {
  const config = getGoogleHealthConfig();
  if (!config) throw new Error("google_health_not_configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAndSaveCode(profileId: string, code: string) {
  const config = getGoogleHealthConfig();
  const prisma = getPrismaClient();
  if (!config || !prisma) throw new Error("google_health_unavailable");
  const parameters = new URLSearchParams({
    code, client_id: config.clientId, client_secret: config.clientSecret,
    redirect_uri: config.redirectUri, grant_type: "authorization_code",
  });
  const result = await tokenRequest(parameters);
  const previous = await prisma.healthConnection.findUnique({ where: { profileId } });
  const refreshToken = result.refresh_token ?? (previous ? decrypt(previous.refreshTokenEncrypted, config.keyBytes) : null);
  if (!refreshToken) throw new Error("google_refresh_token_missing");
  await prisma.healthConnection.upsert({
    where: { profileId },
    create: {
      profileId,
      accessTokenEncrypted: encrypt(result.access_token, config.keyBytes),
      refreshTokenEncrypted: encrypt(refreshToken, config.keyBytes),
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
      scopes: result.scope ?? scopes.join(" "),
    },
    update: {
      accessTokenEncrypted: encrypt(result.access_token, config.keyBytes),
      refreshTokenEncrypted: encrypt(refreshToken, config.keyBytes),
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
      scopes: result.scope ?? previous?.scopes ?? scopes.join(" "),
      lastSyncedAt: null,
    },
  });
}

async function getAccessToken(profileId: string) {
  const config = getGoogleHealthConfig();
  const prisma = getPrismaClient();
  if (!config || !prisma) throw new Error("google_health_unavailable");
  const connection = await prisma.healthConnection.findUnique({ where: { profileId } });
  if (!connection) return null;
  if (connection.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: decrypt(connection.accessTokenEncrypted, config.keyBytes), connection };
  }
  const parameters = new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret,
    refresh_token: decrypt(connection.refreshTokenEncrypted, config.keyBytes), grant_type: "refresh_token",
  });
  const result = await tokenRequest(parameters);
  await prisma.healthConnection.update({
    where: { profileId },
    data: {
      accessTokenEncrypted: encrypt(result.access_token, config.keyBytes),
      ...(result.refresh_token ? { refreshTokenEncrypted: encrypt(result.refresh_token, config.keyBytes) } : {}),
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
    },
  });
  return { token: result.access_token, connection };
}

async function googleRequest(token: string, path: string, body?: unknown) {
  const response = await fetch(`${apiBase}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`google_health_api_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function civilDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { date: { year, month, day } };
}

export async function getGoogleHealthConnectionStatus(profileId: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { configured: Boolean(getGoogleHealthConfig()), connected: false, lastSyncedAt: null };
  const connection = await prisma.healthConnection.findUnique({ where: { profileId }, select: { lastSyncedAt: true } });
  return { configured: Boolean(getGoogleHealthConfig()), connected: Boolean(connection), lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null };
}

export async function disconnectGoogleHealth(profileId: string) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("database_unavailable");
  await prisma.healthConnection.deleteMany({ where: { profileId } });
}

export async function syncGoogleHealth(profileId: string, force = false) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("database_unavailable");
  const credentials = await getAccessToken(profileId);
  if (!credentials) return { connected: false, synced: false };
  if (!force && credentials.connection.lastSyncedAt && Date.now() - credentials.connection.lastSyncedAt.getTime() < 30 * 60_000) {
    return { connected: true, synced: false };
  }
  const dateKey = getTokyoDateKey();
  const tomorrow = addUtcDays(dateKeyToUtcDate(dateKey), 1).toISOString().slice(0, 10);
  const scoped = new Set(credentials.connection.scopes.split(/\s+/));
  const has = (scope: string) => scoped.has(`https://www.googleapis.com/auth/googlehealth.${scope}.readonly`);
  const requested = [has("activity_and_fitness"), has("sleep"), has("health_metrics_and_measurements")];
  const requestResults = await Promise.allSettled([
    has("activity_and_fitness") ? googleRequest(credentials.token, "steps/dataPoints:dailyRollUp", {
      range: { start: civilDate(dateKey), end: civilDate(tomorrow) },
      windowSizeDays: 1,
      dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
    }) : Promise.resolve(null),
    has("sleep") ? googleRequest(credentials.token,
      `sleep/dataPoints:reconcile?${new URLSearchParams({
        dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
        filter: `sleep.interval.civil_end_time >= "${dateKey}" AND sleep.interval.civil_end_time < "${tomorrow}"`,
      })}`) : Promise.resolve(null),
    has("health_metrics_and_measurements") ? googleRequest(credentials.token,
      `daily-resting-heart-rate/dataPoints?${new URLSearchParams({
        filter: `dailyRestingHeartRate.date >= "${dateKey}" AND dailyRestingHeartRate.date < "${tomorrow}"`,
      })}`) : Promise.resolve(null),
  ]);
  if (!requested.some(Boolean) || requestResults.every((result, index) => !requested[index] || result.status === "rejected")) {
    throw new Error("google_health_sync_failed");
  }
  const value = parseGoogleHealthSample(
    requestResults[0].status === "fulfilled" ? requestResults[0].value : null,
    requestResults[1].status === "fulfilled" ? requestResults[1].value : null,
    requestResults[2].status === "fulfilled" ? requestResults[2].value : null,
  );
  if (value.sleepMinutes !== null || value.steps !== null || value.restingHeartRate !== null) {
    await savePhysicalSignals(profileId, { date: dateKey, ...value, source: "google_health", recordedAt: new Date(), preserveMissing: true });
  }
  await prisma.healthConnection.update({ where: { profileId }, data: { lastSyncedAt: new Date() } });
  return { connected: true, synced: true, ...value };
}
