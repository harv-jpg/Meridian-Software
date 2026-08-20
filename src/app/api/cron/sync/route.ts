import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hasCredentialKey, secretsMatch } from "@/lib/crypto";
import { syncAccount } from "@/lib/sync";
import type { EmailAccount } from "@/lib/sync";

/**
 * The nightly inbox sync, for every connected account.
 *
 * Runs before the nudge job so that a deal which had a reply yesterday is not
 * flagged as quiet this morning. See vercel.json for the two schedules.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret || !hasCredentialKey() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Inbox sync is not configured. Needs CRON_SECRET, CREDENTIAL_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 501 }
    );
  }

  if (!secretsMatch(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Accounts already flagged for reauth are skipped: the refresh token is
  // known to be dead, so calling Google again only earns another rejection.
  const { data: accounts } = await supabase
    .from("email_accounts")
    .select(
      "user_id, provider, email_address, auth_method, secret, imap_host, imap_port, access_token, expires_at, last_synced_at"
    )
    .eq("needs_reauth", false);

  let filed = 0;
  let synced = 0;
  const failed: string[] = [];

  for (const account of (accounts ?? []) as EmailAccount[]) {
    try {
      const result = await syncAccount(supabase, account);
      filed += result.filed;
      if (!result.needsReauth) synced += 1;
    } catch {
      // One mailbox failing must not abandon the rest of the run.
      failed.push(account.user_id);
    }
  }

  return NextResponse.json({
    accounts: accounts?.length ?? 0,
    synced,
    filed,
    failed: failed.length,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
