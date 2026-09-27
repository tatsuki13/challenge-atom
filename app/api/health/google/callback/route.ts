import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { exchangeAndSaveCode, syncGoogleHealth } from "@/lib/googleHealth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/login", request.url));
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const saved = cookieStore.get("google_health_oauth_state")?.value;
  cookieStore.delete("google_health_oauth_state");
  const [expectedState, profileId] = saved?.split(".") ?? [];
  const actualState = params.get("state") ?? "";
  if (!expectedState || profileId !== user.profileId ||
    actualState.length !== expectedState.length ||
    !timingSafeEqual(Buffer.from(actualState), Buffer.from(expectedState))) {
    return Response.redirect(new URL("/?health=state_error", request.url));
  }
  const code = params.get("code");
  if (!code || params.has("error")) return Response.redirect(new URL("/?health=cancelled", request.url));
  try {
    await exchangeAndSaveCode(user.profileId, code);
    await syncGoogleHealth(user.profileId, true).catch(() => null);
    return Response.redirect(new URL("/?health=connected", request.url));
  } catch {
    return Response.redirect(new URL("/?health=connection_error", request.url));
  }
}
