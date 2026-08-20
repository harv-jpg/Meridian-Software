import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ImapAuthError, fetchSince } from "@/lib/imap";
import type { ImapCredentials } from "@/lib/imap";
import { MicrosoftAuthError, msRefresh } from "@/lib/microsoft";
import {
  FIRST_SYNC_DAYS,
  MAX_MESSAGES_PER_SYNC,
  addressIndex,
  fileMessage,
} from "@/lib/inbox";
import type { FiledMessage } from "@/lib/inbox";
import type { ClientRecord } from "@/lib/types";

/**
 * Syncing one connected mailbox.
 *
 * Called by the nightly job for every account, and by "Check now" for one.
 * Both must behave identically, so the work lives here rather than in either
 * route.
 *
 * The provider only decides how we authenticate. Once a credential exists, one
 * IMAP connection does the same fetch and the same filing for everybody.
 *
 * Takes a service-role Supabase client: `email_accounts` is unreachable with
 * the anon key by design. Establishing which user this is belongs to the
 * caller.
 */

export interface SyncResult {
  filed: number;
  scanned: number;
  /** Set when the credential is dead and only the user can fix it. */
  needsReauth?: boolean;
}

export interface EmailAccount {
  user_id: string;
  provider: "google" | "microsoft" | "imap";
  email_address: string;
  auth_method: "password" | "oauth";
  /** Encrypted: an app password, or an OAuth refresh token. */
  secret: string;
  imap_host: string;
  imap_port: number;
  access_token: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
}

/** Refresh a minute early rather than waiting to be told it is stale. */
const EXPIRY_GRACE_MS = 60_000;

/**
 * A credential this account can connect with.
 *
 * For a password account that is the stored secret. For an OAuth account it is
 * an access token, refreshed first if the stored one is about to expire — and
 * the new one written back, so the next run does not refresh again needlessly.
 */
async function credentialFor(
  supabase: SupabaseClient,
  account: EmailAccount
): Promise<ImapCredentials> {
  const base = {
    host: account.imap_host,
    port: account.imap_port,
    user: account.email_address,
  };

  if (account.auth_method === "password") {
    return { ...base, method: "password", secret: decryptSecret(account.secret) };
  }

  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  if (account.access_token && expiresAt - EXPIRY_GRACE_MS > Date.now()) {
    return { ...base, method: "oauth", secret: decryptSecret(account.access_token) };
  }

  const tokens = await msRefresh(decryptSecret(account.secret));
  await supabase
    .from("email_accounts")
    .update({
      access_token: encryptSecret(tokens.access_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      // Microsoft rotates refresh tokens; keeping the old one would work until
      // it silently stopped.
      ...(tokens.refresh_token
        ? { secret: encryptSecret(tokens.refresh_token) }
        : {}),
    })
    .eq("user_id", account.user_id);

  return { ...base, method: "oauth", secret: tokens.access_token };
}

/** A credential that will not start working again on its own. */
function isDeadCredential(e: unknown): boolean {
  return e instanceof ImapAuthError || e instanceof MicrosoftAuthError;
}

export async function syncAccount(
  supabase: SupabaseClient,
  account: EmailAccount
): Promise<SyncResult> {
  let credentials: ImapCredentials;
  try {
    credentials = await credentialFor(supabase, account);
  } catch (e) {
    if (isDeadCredential(e)) {
      await flagReauth(supabase, account.user_id);
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

  // Nothing to match against, so nothing worth connecting for.
  if (byAddress.size === 0) {
    await touchSynced(supabase, account.user_id);
    return { filed: 0, scanned: 0 };
  }

  // Overlap the previous run by a day. A message arriving between the last
  // sync and midnight would otherwise be missed forever, and re-seeing one is
  // free: (user_id, message_id) is unique, so the upsert absorbs it.
  const from = account.last_synced_at
    ? new Date(new Date(account.last_synced_at).getTime() - 86400000)
    : new Date(Date.now() - FIRST_SYNC_DAYS * 86400000);

  let messages;
  try {
    messages = await fetchSince(credentials, from, MAX_MESSAGES_PER_SYNC);
  } catch (e) {
    if (isDeadCredential(e)) {
      await flagReauth(supabase, account.user_id);
      return { filed: 0, scanned: 0, needsReauth: true };
    }
    throw e;
  }

  const filed: FiledMessage[] = [];
  for (const message of messages) {
    const row = fileMessage(message, byAddress);
    if (row) filed.push(row);
  }

  if (filed.length > 0) {
    await supabase.from("email_messages").upsert(
      filed.map((row) => ({ ...row, user_id: account.user_id })),
      { onConflict: "user_id,message_id" }
    );
  }

  await touchSynced(supabase, account.user_id);
  return { filed: filed.length, scanned: messages.length };
}

/**
 * A credential that no longer works never starts working again by itself.
 * Flagging it means the UI can ask for a reconnect, rather than the sync
 * failing quietly every night forever.
 */
async function flagReauth(supabase: SupabaseClient, userId: string) {
  await supabase
    .from("email_accounts")
    .update({ needs_reauth: true })
    .eq("user_id", userId);
}

async function touchSynced(supabase: SupabaseClient, userId: string) {
  await supabase
    .from("email_accounts")
    .update({ last_synced_at: new Date().toISOString(), needs_reauth: false })
    .eq("user_id", userId);
}
