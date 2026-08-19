export type Stage = "lead" | "proposal_sent" | "negotiating" | "won" | "lost";
export type InvoiceBasis = "time" | "fixed";
export type InvoiceStatus = "draft" | "sent" | "paid";
export type ContractStatus = "draft" | "sent" | "signed";

export interface ClientRecord {
  id: string;
  /** Who owns this row. Redundant everywhere row-level security applies, and
   *  load-bearing in the one place it does not: the nightly job runs with no
   *  session, so it groups and filters by this itself. */
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage: Stage;
  value_pence: number | null;
  notes: string | null;
  address: string | null;
  /** ISO date (no time). The day you next intend to chase this deal. */
  follow_up_on: string | null;
  /** Set once archived; archived clients are hidden from the board. */
  archived_at: string | null;
  created_at: string;
  /** Touched by a database trigger on every write to the row. */
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  description: string | null;
  minutes: number;
  invoice_id: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  /** Assigned per user by a database trigger, not by the client. */
  invoice_number: number;
  amount_pence: number;
  basis: InvoiceBasis;
  status: InvoiceStatus;
  /** VAT rate in basis points: 2000 means 20%. Zero when not registered. */
  vat_rate_bp: number;
  /** ISO date (no time). Null means no due date was set. */
  due_date: string | null;
  /** Unguessable value behind the public /invoice/[token] URL. */
  share_token: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  /** Hundredths, so 150 means 1.5. Avoids floats for part-hours and part-days. */
  quantity_centi: number;
  unit_price_pence: number;
  position: number;
  created_at: string;
}

export interface BusinessProfile {
  user_id: string;
  business_name: string | null;
  address: string | null;
  vat_number: string | null;
  payment_details: string | null;
  invoice_footer: string | null;
  default_vat_rate_bp: number;
}

export interface Contract {
  id: string;
  client_id: string;
  title: string;
  body: string;
  sign_token: string;
  status: ContractStatus;
  signed_name: string | null;
  signed_at: string | null;
  created_at: string;
}

/** A message the inbox sync filed against a client. */
export interface EmailMessage {
  id: string;
  client_id: string;
  message_id: string;
  thread_id: string;
  /** `in` means they wrote to you, `out` means you wrote to them. */
  direction: "in" | "out";
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  snippet: string | null;
  sent_at: string;
}

/**
 * A connected mailbox, as the browser is allowed to see it.
 *
 * Comes from `get_email_connection()` rather than the table: `email_accounts`
 * has no select policy, so the tokens are unreachable with the anon key and
 * this shape is the only view of it that exists client-side.
 */
export interface EmailConnection {
  provider: string;
  email_address: string;
  last_synced_at: string | null;
  /** Google stopped accepting the grant; the user has to reconnect. */
  needs_reauth: boolean;
  connected_at: string;
}

/** Why a nudge was written. */
export type NudgeKind = "silence" | "payment";
/** `waiting` until its owner sends or dismisses it. */
export type NudgeStatus = "waiting" | "sent" | "dismissed";

/**
 * A follow-up email written by the nightly job and parked for its owner.
 *
 * Nothing sends one of these. It sits until the person who owns it reads it,
 * edits it and sends it themselves, or dismisses it.
 */
export interface Nudge {
  id: string;
  client_id: string;
  kind: NudgeKind;
  subject: string;
  body: string;
  /** One line naming the fact the draft leans on. For the sender only. */
  angle: string;
  status: NudgeStatus;
  resolved_at: string | null;
  created_at: string;
}

/** Today as an ISO date, for comparing against date-only columns. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A follow-up is due once its date arrives — unlike an overdue invoice, which
 * needs the date to have *passed*. You chase someone on the day you said you
 * would, but an invoice due today isn't late yet.
 */
export function isFollowUpDue(
  client: Pick<ClientRecord, "follow_up_on">
): boolean {
  if (!client.follow_up_on) return false;
  return client.follow_up_on <= todayISO();
}

/** An invoice is overdue once its due date has passed and it isn't paid. */
export function isOverdue(invoice: Pick<Invoice, "due_date" | "status">): boolean {
  if (!invoice.due_date || invoice.status === "paid") return false;
  // Compare dates only — an invoice due today is not yet overdue.
  return invoice.due_date < todayISO();
}

/** Whole days between a timestamp and now, floored. Negative dates clamp to 0. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** How long a deal can sit untouched before the board says so. */
export const QUIET_AFTER_DAYS = 21;

/** Deals that can still be won or lost. A closed deal going quiet is fine. */
const OPEN_STAGES: Stage[] = ["lead", "proposal_sent", "negotiating"];

/**
 * The last time anything happened on this deal.
 *
 * `clients.updated_at` moves on any write to the row — a stage change, an
 * edited note, a new follow-up date. Raising an invoice does not touch it, and
 * neither does an email arriving, so both are folded in here.
 *
 * Emails matter most: a client who replied last week is not quiet, whatever
 * the client row says, and before the inbox sync existed there was no way to
 * know that. Logging time is the one activity still missed — time entries are
 * loaded per client in the drawer, not for the whole board. The effect stays
 * conservative: a client can look quieter than they are, never busier.
 */
export function lastTouchedAt(
  client: Pick<ClientRecord, "id" | "created_at" | "updated_at">,
  invoices: Pick<Invoice, "client_id" | "created_at">[] = [],
  emails: Pick<EmailMessage, "client_id" | "sent_at">[] = []
): string {
  let latest = client.updated_at || client.created_at;
  for (const invoice of invoices) {
    if (invoice.client_id !== client.id) continue;
    if (invoice.created_at > latest) latest = invoice.created_at;
  }
  for (const email of emails) {
    if (email.client_id !== client.id) continue;
    if (email.sent_at > latest) latest = email.sent_at;
  }
  return latest;
}

/**
 * A deal has gone quiet when nothing has happened on it for three weeks.
 *
 * A client with a follow-up date is never quiet, whatever the date says: you
 * have already decided when to chase them, and `isFollowUpDue` raises it on
 * the day. Flagging both would put the same name on the same list twice.
 */
export function isQuiet(
  client: Pick<
    ClientRecord,
    "id" | "stage" | "follow_up_on" | "archived_at" | "created_at" | "updated_at"
  >,
  invoices: Pick<Invoice, "client_id" | "created_at">[] = [],
  emails: Pick<EmailMessage, "client_id" | "sent_at">[] = [],
  now: Date = new Date()
): boolean {
  if (client.archived_at) return false;
  if (client.follow_up_on) return false;
  if (!OPEN_STAGES.includes(client.stage)) return false;
  return (
    daysSince(lastTouchedAt(client, invoices, emails), now) >= QUIET_AFTER_DAYS
  );
}
