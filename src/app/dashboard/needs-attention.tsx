"use client";

import { isFollowUpDue, isOverdue } from "@/lib/types";
import type { ClientRecord, Invoice } from "@/lib/types";
import { formatDate, formatGBP } from "@/lib/format";

/**
 * The two questions a freelancer opens a CRM to answer — who owes me money,
 * and who haven't I chased — previously lived in different places: overdue
 * invoices inside a client drawer, follow-ups behind a board filter. This
 * puts both on the first screen.
 */
export default function NeedsAttention({
  clients,
  invoices,
  onOpenClient,
}: {
  clients: ClientRecord[];
  invoices: Invoice[];
  onOpenClient: (clientId: string) => void;
}) {
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  const overdue = invoices
    .filter(isOverdue)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  const followUps = clients
    .filter(isFollowUpDue)
    .sort((a, b) => (a.follow_up_on ?? "").localeCompare(b.follow_up_on ?? ""));

  if (overdue.length === 0 && followUps.length === 0) return null;

  const overdueTotal = overdue.reduce((sum, i) => sum + i.amount_pence, 0);

  return (
    <section
      aria-label="Needs attention"
      className="mb-6 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-ink/10 bg-ink/[0.03] px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Needs attention
        </h2>
        <span className="font-mono text-xs text-slate-400">
          {overdue.length + followUps.length}
        </span>
      </div>

      <ul className="divide-y divide-ink/10">
        {overdue.map((inv) => {
          const client = clientsById.get(inv.client_id);
          return (
            <li key={inv.id}>
              <button
                onClick={() => onOpenClient(inv.client_id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm
                           transition hover:bg-ink/[0.03]"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {client?.name ?? "Unknown client"}
                  </span>
                  <span className="ml-2 text-slate-500">
                    invoice #{inv.invoice_number} overdue
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(inv.due_date)}
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-sm font-medium text-red-600">
                  {formatGBP(inv.amount_pence)}
                </span>
              </button>
            </li>
          );
        })}

        {followUps.map((client) => (
          <li key={client.id}>
            <button
              onClick={() => onOpenClient(client.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm
                         transition hover:bg-ink/[0.03]"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{client.name}</span>
                <span className="ml-2 text-slate-500">due a follow-up</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {formatDate(client.follow_up_on)}
              </span>
              <span className="w-20 shrink-0" />
            </button>
          </li>
        ))}
      </ul>

      {overdue.length > 0 && (
        <p className="border-t border-ink/10 bg-ink/[0.03] px-4 py-2 text-right text-xs text-slate-500">
          <span className="font-mono font-medium text-ink">
            {formatGBP(overdueTotal)}
          </span>{" "}
          outstanding past its due date
        </p>
      )}
    </section>
  );
}
