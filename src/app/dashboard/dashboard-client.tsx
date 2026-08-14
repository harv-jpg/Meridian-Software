"use client";

import { useState } from "react";
import PipelineBoard from "./pipeline-board";
import RevenueSummary from "./revenue-summary";
import ImportCsvModal from "./import-csv-modal";
import { isFollowUpDue } from "@/lib/types";
import type { ClientRecord } from "@/lib/types";

export default function DashboardClient({
  initialClients,
  userId,
}: {
  initialClients: ClientRecord[];
  userId: string;
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [showImport, setShowImport] = useState(false);
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);

  const dueCount = clients.filter(isFollowUpDue).length;

  // Clearing the last outstanding follow-up would otherwise leave the board
  // filtered to nothing with no obvious way back.
  if (onlyFollowUps && dueCount === 0) setOnlyFollowUps(false);

  return (
    <div>
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
