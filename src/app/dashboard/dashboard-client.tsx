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
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowImport(true)}
          className="rounded border border-ink/20 px-4 py-2 text-sm font-medium"
        >
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
