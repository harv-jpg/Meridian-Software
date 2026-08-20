import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hasCredentialKey } from "@/lib/crypto";
import { syncAccount } from "@/lib/sync";
import type { EmailAccount } from "@/lib/sync";

/**
 * Sync now, for one signed-in user.
 *
 * The nightly job covers everyone; this exists because a daily sync is not
 * what "sits on your inbox" should feel like when you have just connected an
 * account and want to see it work.
 */
export async function POST() {
  if (!hasCredentialKey() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Mailbox connections are not configured on this deployment." },
      { status: 501 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The signed-in session establishes who this is; the service client is then
  // scoped to that id explicitly, because `email_accounts` is unreadable with
  // the anon key by design.
  const service = createServiceClient();
  const { data: account } = await service
    .from("email_accounts")
    .select(
      "user_id, provider, email_address, auth_method, secret, imap_host, imap_port, access_token, expires_at, last_synced_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "No inbox connected." }, { status: 404 });
  }

  try {
    const result = await syncAccount(service, account as EmailAccount);
    if (result.needsReauth) {
      return NextResponse.json(
        { error: "Google needs you to reconnect this account.", needsReauth: true },
        { status: 409 }
      );
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Google. Try again shortly." },
      { status: 502 }
    );
  }
}
