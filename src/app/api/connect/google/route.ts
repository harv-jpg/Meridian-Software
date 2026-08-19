import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { STATE_COOKIE, authorizeUrl, isConfigured } from "@/lib/google";

/** Ten minutes is longer than anyone takes over a consent screen. */
const STATE_MAX_AGE = 600;

/**
 * Starts the Google consent flow.
 *
 * The `state` value is random, set as an http-only cookie, and checked on the
 * way back. Without it, anyone could link their own Google account to a
 * signed-in user's session by getting them to load a crafted callback URL.
 */
export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "Inbox sync is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
      { status: 501 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(authorizeUrl(origin, state));
}
