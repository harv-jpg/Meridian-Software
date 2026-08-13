"use client";

import { useState } from "react";
import PipelineBoard from "./pipeline-board";
import RevenueSummary from "./revenue-summary";
import ImportCsvModal from "./import-csv-modal";
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

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {clients.length === 0
            ? "No clients yet — add your first lead below."
            : `${clients.length} client${clients.length === 1 ? "" : "s"} tracked`}
        </p>
        <button onClick={() => setShowImport(true)} className="btn-ghost">
          Import from CSV
        </button>
      </div>

      <RevenueSummary clients={clients} />
      <PipelineBoard clients={clients} setClients={setClients} userId={userId} />

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
