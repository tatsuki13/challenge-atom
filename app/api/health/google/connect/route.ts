import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getAuthorizationUrl, getGoogleHealthConfig } from "@/lib/googleHealth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!getGoogleHealthConfig()) return Response.json({ error: "google_health_not_configured" }, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  (await cookies()).set("google_health_oauth_state", `${state}.${user.profileId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/health/google/callback",
    maxAge: 600,
  });
  return Response.redirect(getAuthorizationUrl(state));
}
