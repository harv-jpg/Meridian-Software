import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GoogleAuthError,
  fetchMessage,
  listMessageIds,
  refreshAccessToken,
} from "@/lib/google";
import {
  MAX_MESSAGES_PER_SYNC,
  addressIndex,
  buildQuery,
  fileMessage,
} from "@/lib/inbox";
import type { FiledMessage } from "@/lib/inbox";
import type { ClientRecord } from "@/lib/types";

/**
 * Syncing one connected mailbox.
 *
 * Called by the nightly job for every account, and by the Sync now button for
 * one. Both paths must behave identically, so the work lives here rather than
 * in either route.
 *
 * Takes a service-role Supabase client: `email_accounts` is unreachable with
 * the anon key by design. The caller is responsible for having established
 * which user this is.
 */

export interface SyncResult {
  filed: number;
  scanned: number;
  /** Set when Google refused the grant and the user has to reconnect. */
  needsReauth?: boolean;
}

export interface EmailAccount {
  user_id: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  last_synced_at: string | null;
}

/** Refresh a minute early rather than waiting to be told it is stale. */
const EXPIRY_GRACE_MS = 60_000;

/**
 * A usable access token, refreshing first if the stored one is about to die.
 *
 * Google only returns a new refresh token when it feels like it, so the stored
 * one is kept unless a replacement actually arrives.
 */
async function usableToken(
  supabase: SupabaseClient,
  account: EmailAccount
): Promise<string> {
  const expiresAt = new Date(account.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_GRACE_MS > Date.now()) {
    return account.access_token;
  }

  const tokens = await refreshAccessToken(account.refresh_token);
  await supabase
    .from("email_accounts")
    .update({
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    })
    .eq("user_id", account.user_id);

  return tokens.access_token;
}

export async function syncAccount(
  supabase: SupabaseClient,
  account: EmailAccount
): Promise<SyncResult> {
  let accessToken: string;
  try {
    accessToken = await usableToken(supabase, account);
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      // A refresh token that no longer works never starts working again on
      // its own. Flag it so the UI can ask for a reconnect rather than the
      // sync failing quietly every night forever.
      await supabase
        .from("email_accounts")
        .update({ needs_reauth: true })
        .eq("user_id", account.user_id);
      return { filed: 0, scanned: 0, needsReauth: true };
    }
    throw e;
  }

  const { data: clientRows } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", account.user_id)
    .is("archived_at", null);

  const clients = (clientRows ?? []) as ClientRecord[];
  const byAddress = addressIndex(clients);

  const query = buildQuery(
    [...byAddress.keys()],
    account.last_synced_at ? new Date(account.last_synced_at) : null
  );

  // No client has an email address yet, so there is nothing to match against
  // and no query worth sending.
  if (!query) {
    await supabase
      .from("email_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", account.user_id);
    return { filed: 0, scanned: 0 };
  }

  const ids = await listMessageIds(accessToken, query, MAX_MESSAGES_PER_SYNC);

  const connected = account.email_address.trim().toLowerCase();
  const filed: FiledMessage[] = [];

  for (const id of ids) {
    const message = await fetchMessage(accessToken, id);
    const row = fileMessage(message, connected, byAddress);
    if (row) filed.push(row);
  }

  if (filed.length > 0) {
    // Upsert rather than insert: the query window deliberately overlaps by a
    // day, so re-seeing a message is normal and must not be an error.
    await supabase.from("email_messages").upsert(
      filed.map((row) => ({ ...row, user_id: account.user_id })),
      { onConflict: "user_id,message_id" }
    );
  }

  await supabase
    .from("email_accounts")
    .update({ last_synced_at: new Date().toISOString(), needs_reauth: false })
    .eq("user_id", account.user_id);

  return { filed: filed.length, scanned: ids.length };
}
