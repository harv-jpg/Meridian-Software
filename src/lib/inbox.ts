import type { GmailHeader, GmailMessage } from "@/lib/google";
import type { ClientRecord } from "@/lib/types";

/**
 * Turning Gmail's shapes into rows, and deciding which client a message
 * belongs to.
 *
 * Kept apart from the route because this is where the judgement lives, and
 * judgement about whose mail is filed against whom is worth being able to test
 * without a Google account.
 */

/** How much history the very first sync reaches back for. */
export const FIRST_SYNC_DAYS = 90;
/** Ceiling on one sync, so a busy mailbox cannot stall the run. */
export const MAX_MESSAGES_PER_SYNC = 200;

function header(message: GmailMessage, name: string): string | null {
  const headers: GmailHeader[] = message.payload?.headers ?? [];
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

/**
 * The address out of a From/To header.
 *
 * Headers arrive as `Sam Fenn <sam@fenn.co.uk>`, or bare, or with quotes and
 * commas inside the display name. Taking what is between the angle brackets
 * when they exist, and the whole trimmed string when they do not, handles
 * every form this app has to deal with.
 */
export function parseAddress(header: string | null): string | null {
  if (!header) return null;
  const angled = header.match(/<([^>]+)>/);
  const raw = (angled ? angled[1] : header).trim().toLowerCase();
  // A bare display name with no address at all is not an address.
  return raw.includes("@") ? raw : null;
}

/** Every address on a header that may hold several, comma-separated. */
export function parseAddressList(value: string | null): string[] {
  if (!value) return [];
  // Split on commas that are not inside angle brackets or quotes. Display
  // names containing commas are common enough to be worth not breaking.
  const parts = value.split(/,(?![^<]*>)/);
  return parts
    .map((p) => parseAddress(p))
    .filter((a): a is string => a !== null);
}

export interface FiledMessage {
  client_id: string;
  message_id: string;
  thread_id: string;
  direction: "in" | "out";
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  snippet: string | null;
  sent_at: string;
}

/**
 * Which client this message belongs to, if any.
 *
 * Matching is on the exact address, not the domain. Two clients at the same
 * company would otherwise collect each other's mail, and filing a message
 * against the wrong client is worse than not filing it at all — it puts words
 * in front of you attributed to someone who never said them.
 *
 * Direction is decided by which side of the message the client is on, not by
 * whether the sender is the connected mailbox. That distinction matters: plenty
 * of people authenticate as one address and send as another — an iCloud custom
 * domain, a Gmail "send mail as" alias, a shared studio address. Keying off the
 * connected address silently dropped every message such a person sent, because
 * it matched neither side. Keying off the client works whatever name you send
 * under.
 *
 * @param byAddress Client id keyed by lowercased client email.
 */
export function fileMessage(
  message: GmailMessage,
  byAddress: Map<string, string>
): FiledMessage | null {
  const from = parseAddress(header(message, "From"));
  const recipients = parseAddressList(header(message, "To"));

  // If a client sent it, they wrote to you. Otherwise, if a client is on the
  // receiving end, you wrote to them.
  let clientId = from ? byAddress.get(from) : undefined;
  let outbound = false;

  if (!clientId) {
    for (const address of recipients) {
      const match = byAddress.get(address);
      if (match) {
        clientId = match;
        outbound = true;
        break;
      }
    }
  }
  if (!clientId) return null;

  // Gmail gives epoch milliseconds as a string. Without it there is no point
  // filing the message: the record is chronological or it is nothing.
  const ms = Number(message.internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  return {
    client_id: clientId,
    message_id: message.id,
    thread_id: message.threadId,
    direction: outbound ? "out" : "in",
    from_address: from,
    to_address: recipients[0] ?? null,
    subject: header(message, "Subject"),
    snippet: message.snippet ?? null,
    sent_at: new Date(ms).toISOString(),
  };
}

/** Client id by lowercased email, for the clients that have one. */
export function addressIndex(clients: ClientRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const client of clients) {
    const address = client.email?.trim().toLowerCase();
    // First one wins: if two clients share an address there is no way to tell
    // which a message meant, and picking the newer would change the answer
    // over time for the same message.
    if (address && !index.has(address)) index.set(address, client.id);
  }
  return index;
}

/**
 * The Gmail query for one sync.
 *
 * Addresses go into the query so Google filters server-side. Without this the
 * sync would download an entire mailbox to keep the few messages that matter.
 * Returns null when there is nothing to ask about.
 */
export function buildQuery(
  addresses: string[],
  since: Date | null,
  now: Date = new Date()
): string | null {
  if (addresses.length === 0) return null;

  const from = since ?? new Date(now.getTime() - FIRST_SYNC_DAYS * 86400000);
  // Gmail's `after:` takes a date, not a timestamp, and is exclusive of
  // nothing — overlapping by a day is deliberate. A message arriving between
  // the last sync and midnight would otherwise be missed forever, and the
  // unique constraint on (user_id, message_id) makes re-seeing one free.
  const stamp = new Date(from.getTime() - 86400000).toISOString().slice(0, 10);

  const people = addresses.map((a) => `from:${a} OR to:${a}`).join(" OR ");
  return `(${people}) after:${stamp.replace(/-/g, "/")}`;
}
