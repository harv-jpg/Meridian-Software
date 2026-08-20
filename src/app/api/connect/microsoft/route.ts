import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MS_STATE_COOKIE, isMicrosoftConfigured, msAuthorizeUrl } from "@/lib/microsoft";

/** Ten minutes is longer than anyone takes over a sign-in screen. */
const STATE_MAX_AGE = 600;

/**
 * Starts the Microsoft sign-in flow.
 *
 * The `state` value is random, http-only and checked on the way back. Without
 * it, someone could attach their own mailbox to a signed-in user's account by
 * getting them to load a crafted callback URL.
 */
export async function GET(request: Request) {
  if (!isMicrosoftConfigured()) {
    return NextResponse.json(
      {
        error:
          "Outlook is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.",
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
  jar.set(MS_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });

  return NextResponse.redirect(msAuthorizeUrl(new URL(request.url).origin, state));
}
