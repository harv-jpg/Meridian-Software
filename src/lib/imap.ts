import { ImapFlow } from "imapflow";
import type { GmailHeader, GmailMessage } from "@/lib/google";

/**
 * Reading a mailbox over IMAP.
 *
 * One connection, one fetch, whatever the provider. Authentication is the only
 * thing that varies — a password for most hosts, an XOAUTH2 access token for
 * Microsoft — and `imapflow` takes either on the same connection.
 *
 * Envelopes only. `envelope` gives sender, recipients, subject and date
 * without downloading a body, which is both far faster and the same promise
 * the Gmail path made: this is a record of what happened and when, not a copy
 * of anyone's correspondence.
 */

/** Something went wrong that reconnecting will not fix. */
export class ImapAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImapAuthError";
  }
}

export interface ImapCredentials {
  host: string;
  port: number;
  user: string;
  /** An app password, or an OAuth access token when `method` is "oauth". */
  secret: string;
  method: "password" | "oauth";
}

/**
 * IMAP's own error signalling is thin, so classify on the response code.
 *
 * `AUTHENTICATIONFAILED` means the credential is wrong or withdrawn and will
 * stay wrong; anything else may be transient and is worth retrying tomorrow.
 */
function isAuthFailure(e: unknown): boolean {
  const err = e as { authenticationFailed?: boolean; responseText?: string; code?: string };
  if (err?.authenticationFailed) return true;
  const text = `${err?.code ?? ""} ${err?.responseText ?? ""}`.toUpperCase();
  return text.includes("AUTHENTICATIONFAILED") || text.includes("INVALIDCREDENTIALS");
}

function connection(creds: ImapCredentials): ImapFlow {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: true,
    auth:
      creds.method === "oauth"
        ? { user: creds.user, accessToken: creds.secret }
        : { user: creds.user, pass: creds.secret },
    // The library logs every command at info level otherwise, which on a mail
    // connection means putting subjects and addresses into the platform logs.
    logger: false,
    // A hung mail server must not hold a serverless invocation open until the
    // platform kills it mid-run.
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

/** Proves a credential works, before it is stored. */
export async function verifyCredentials(creds: ImapCredentials): Promise<void> {
  const client = connection(creds);
  try {
    await client.connect();
  } catch (e) {
    if (isAuthFailure(e)) {
      throw new ImapAuthError("Those details were not accepted by the mail server.");
    }
    throw new ImapAuthError(
      "Could not reach that mail server. Check the host and port."
    );
  } finally {
    // `logout` on a connection that never opened throws; close is safe either
    // way, and must not mask the error we are already reporting.
    closeQuietly(client);
  }
}

/**
 * Messages since a date, newest first, as the shape the filing logic expects.
 *
 * Reuses `GmailMessage` rather than inventing a parallel type. That shape is
 * just "headers, a snippet and a timestamp", which is what every provider
 * gives; keeping one type means `fileMessage` and its tests carry over
 * untouched from the Gmail work.
 *
 * Filtering by correspondent happens after the fetch, in `fileMessage`, rather
 * than in an IMAP SEARCH. Composing an OR across every client address is
 * awkward in IMAP and inconsistently implemented across servers; fetching
 * envelopes since a date is one round trip and reliable everywhere.
 */
export async function fetchSince(
  creds: ImapCredentials,
  since: Date,
  max: number
): Promise<GmailMessage[]> {
  const client = connection(creds);
  const messages: GmailMessage[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Newest first, then capped — a mailbox that has been quiet for months
      // should not spend the whole budget on its oldest messages.
      const wanted = uids.slice(-max).reverse();

      for await (const row of client.fetch(
        wanted,
        { envelope: true, uid: true },
        { uid: true }
      )) {
        const env = row.envelope;
        if (!env) continue;

        const from = env.from?.[0];
        const headers: GmailHeader[] = [
          {
            name: "From",
            value: from ? formatAddress(from.name, from.address) : "",
          },
          {
            name: "To",
            value: (env.to ?? [])
              .map((a) => formatAddress(a.name, a.address))
              .join(", "),
          },
          { name: "Subject", value: env.subject ?? "" },
        ];

        const sent = env.date ? new Date(env.date) : null;
        messages.push({
          // messageId is the mailbox-independent identity, so the same message
          // seen twice — or after a reconnect that renumbers UIDs — is one row.
          id: env.messageId || `uid-${row.uid}`,
          threadId: env.inReplyTo || env.messageId || `uid-${row.uid}`,
          snippet: undefined,
          internalDate: sent ? String(sent.getTime()) : undefined,
          payload: { headers },
        });
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    if (isAuthFailure(e)) {
      throw new ImapAuthError("The mail server rejected the stored credential.");
    }
    throw e;
  } finally {
    closeQuietly(client);
  }

  return messages;
}

/** Never let tearing down a connection replace the real error. */
function closeQuietly(client: ImapFlow): void {
  try {
    client.close();
  } catch {
    // Already gone.
  }
}

/** `Sam Fenn <sam@fenn.co.uk>`, or the bare address when there is no name. */
function formatAddress(name: string | undefined, address: string | undefined): string {
  if (!address) return name ?? "";
  return name ? `${name} <${address}>` : address;
}
