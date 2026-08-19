import { isOverdue, isQuiet } from "@/lib/types";
import type { ClientRecord, Invoice } from "@/lib/types";
import type { DraftReason } from "@/lib/drafting";

/**
 * Deciding who gets a draft tonight.
 *
 * Kept apart from the route because this is the part with rules in it, and
 * rules about who gets emailed are worth being able to test without a database
 * or a model. The route does the fetching and the writing; this does the
 * choosing.
 */

/** Bounds on one run, so a large account cannot produce a surprising bill. */
export const MAX_PER_USER = 3;
export const MAX_PER_RUN = 50;

export interface NudgeCandidate {
  client: ClientRecord;
  reason: DraftReason;
}

/**
 * Which clients need a draft written, in the order they should be written.
 *
 * @param clients      Non-archived clients, across every account.
 * @param invoicesByClient  Unpaid invoices grouped by client id.
 * @param waiting      `${clientId}:${kind}` for every nudge still unresolved.
 * @param now          Injected so the caller's clock is testable.
 */
export function selectCandidates(
  clients: ClientRecord[],
  invoicesByClient: Map<string, Invoice[]>,
  waiting: Set<string>,
  now: Date = new Date()
): NudgeCandidate[] {
  const candidates: NudgeCandidate[] = [];
  const perUser = new Map<string, number>();

  for (const client of clients) {
    const own = invoicesByClient.get(client.id) ?? [];

    // Money outranks silence: if something is genuinely late, that is what the
    // email should be about. One nudge per client per run either way.
    const reason: DraftReason | null = own.some(isOverdue)
      ? "payment"
      : isQuiet(client, own, now)
        ? "silence"
        : null;

    if (!reason) continue;

    // Already drafted and not yet dealt with — leave it alone rather than
    // stacking a second draft on the same fact. A dismissed nudge counts as
    // dealt with, which is how dismissing stops it coming back tomorrow.
    if (waiting.has(`${client.id}:${reason}`)) continue;

    // A freelancer with four deals going cold on the same night gets three
    // drafts; the fourth waits for tomorrow, by which time they will have
    // dealt with some of them.
    const used = perUser.get(client.user_id) ?? 0;
    if (used >= MAX_PER_USER) continue;
    perUser.set(client.user_id, used + 1);

    candidates.push({ client, reason });
    if (candidates.length >= MAX_PER_RUN) break;
  }

  return candidates;
}

/** Groups invoices by client id in one pass. */
export function groupInvoices(invoices: Invoice[]): Map<string, Invoice[]> {
  const byClient = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    const list = byClient.get(invoice.client_id);
    if (list) list.push(invoice);
    else byClient.set(invoice.client_id, [invoice]);
  }
  return byClient;
}
