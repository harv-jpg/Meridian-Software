export type Stage = "lead" | "proposal_sent" | "negotiating" | "won" | "lost";
export type InvoiceBasis = "time" | "fixed";
export type InvoiceStatus = "draft" | "sent" | "paid";
export type ContractStatus = "draft" | "sent" | "signed";

export interface ClientRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage: Stage;
  value_pence: number | null;
  notes: string | null;
  /** ISO date (no time). The day you next intend to chase this deal. */
  follow_up_on: string | null;
  created_at: string;
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
  /** ISO date (no time). Null means no due date was set. */
  due_date: string | null;
  /** Unguessable value behind the public /invoice/[token] URL. */
  share_token: string;
  created_at: string;
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
