import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  STATE_COOKIE,
  exchangeCode,
  fetchEmailAddress,
  isConfigured,
} from "@/lib/google";

/** Back to settings with a message the page knows how to render. */
function settings(request: Request, outcome: string) {
  const url = new URL("/dashboard/settings", request.url);
  url.searchParams.set("inbox", outcome);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  // Single-use whatever happens next.
  jar.delete(STATE_COOKIE);

  if (!isConfigured()) return settings(request, "unconfigured");

  // The user pressed Cancel on Google's screen, or Google refused.
  if (url.searchParams.get("error")) return settings(request, "cancelled");

  const state = url.searchParams.get("state");
  if (!expected || !state || state !== expected) {
    // Either a stale tab or someone else's callback. Either way, not a grant
    // this session asked for.
    return settings(request, "state");
  }

  const code = url.searchParams.get("code");
  if (!code) return settings(request, "failed");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = await exchangeCode(code, url.origin);

    // Without a refresh token the connection would die within the hour and
    // there would be nothing to renew it with. Better to fail here, visibly,
    // than to store something that stops working tomorrow.
    if (!tokens.refresh_token) return settings(request, "norefresh");

    const emailAddress = await fetchEmailAddress(tokens.access_token);

    // The service role writes this row: `email_accounts` has no insert or
    // update policy, deliberately, so that tokens are unreachable from the
    // browser. See migration 007.
    const service = createServiceClient();
    const { error } = await service.from("email_accounts").upsert(
      {
        user_id: user.id,
        provider: "google",
        email_address: emailAddress,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        needs_reauth: false,
        // Reconnecting a different address should not inherit the old
        // mailbox's cursor.
        history_id: null,
      },
      { onConflict: "user_id" }
    );

    if (error) return settings(request, "failed");
    return settings(request, "connected");
  } catch {
    return settings(request, "failed");
  }
}
