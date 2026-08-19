"use client";

import { useMemo, useState } from "react";
import PipelineBoard from "./pipeline-board";
import RevenueSummary from "./revenue-summary";
import ImportCsvModal from "./import-csv-modal";
import NeedsAttention from "./needs-attention";
import WaitingDrafts from "./waiting-drafts";
import { isFollowUpDue, isQuiet } from "@/lib/types";
import type { ClientRecord, Invoice, Nudge } from "@/lib/types";

export default function DashboardClient({
  initialClients,
  initialInvoices,
  initialNudges,
  defaultVatRateBp,
  userId,
}: {
  initialClients: ClientRecord[];
  initialInvoices: Invoice[];
  /** Drafts the nightly job parked. Empty unless that job is configured. */
  initialNudges: Nudge[];
  defaultVatRateBp: number;
  userId: string;
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [nudges, setNudges] = useState<Nudge[]>(initialNudges);
  const [showImport, setShowImport] = useState(false);
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);
  // Selection lives here rather than in the board, so the attention strip can
  // open a client too.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dueCount = clients.filter(isFollowUpDue).length;

  // Computed once here rather than per card: the board would otherwise need
  // the invoices too, only to work out a date it never displays.
  const quietIds = useMemo(
    () =>
      new Set(
        clients.filter((c) => isQuiet(c, initialInvoices)).map((c) => c.id)
      ),
    [clients, initialInvoices]
  );

  // Clearing the last outstanding follow-up would otherwise leave the board
  // filtered to nothing with no obvious way back.
  if (onlyFollowUps && dueCount === 0) setOnlyFollowUps(false);

  return (
    <div>
      <WaitingDrafts
        nudges={nudges}
        clients={clients}
        onResolved={(id) => setNudges((prev) => prev.filter((n) => n.id !== id))}
      />

      <NeedsAttention
        clients={clients}
        invoices={initialInvoices}
        quietIds={quietIds}
        onOpenClient={setSelectedId}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-500">
            {clients.length === 0
              ? "No clients yet — add your first lead below."
              : `${clients.length} client${clients.length === 1 ? "" : "s"} tracked`}
          </p>

          {dueCount > 0 && (
            <button
              onClick={() => setOnlyFollowUps((v) => !v)}
              aria-pressed={onlyFollowUps}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                onlyFollowUps
                  ? "border-teal bg-teal text-white"
                  : "border-teal/30 bg-teal/10 text-teal hover:bg-teal/20"
              }`}
            >
              {dueCount} to follow up
              {onlyFollowUps && <span className="ml-1.5">✕</span>}
            </button>
          )}
        </div>

        <button onClick={() => setShowImport(true)} className="btn-ghost">
          Import from CSV
        </button>
      </div>

      <RevenueSummary clients={clients} />
      <PipelineBoard
        clients={clients}
        setClients={setClients}
        userId={userId}
        onlyFollowUps={onlyFollowUps}
        quietIds={quietIds}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        defaultVatRateBp={defaultVatRateBp}
      />

      {showImport && (
        <ImportCsvModal
          userId={userId}
          onClose={() => setShowImport(false)}
          onImported={(imported) => {
            setClients((prev) => [...imported, ...prev]);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}
