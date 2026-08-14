import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after a user clicks a link in one of its emails —
// signup confirmation, or a password reset. We exchange the code for a
// session, then send them wherever the link asked for.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Only relative paths are honoured, so a crafted ?next=https://evil.example
  // cannot turn this into an open redirect.
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return NextResponse.redirect(`${origin}${destination}`);
}
