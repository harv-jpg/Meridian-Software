"use client";

import { useState } from "react";
import type { ClientRecord } from "@/lib/types";
import NotesTab from "./notes-tab";
import TimeTab from "./time-tab";
import InvoicesTab from "./invoices-tab";
import ContractsTab from "./contracts-tab";

type Tab = "notes" | "time" | "invoices" | "contracts";

const TABS: { key: Tab; label: string }[] = [
  { key: "notes", label: "Notes" },
  { key: "time", label: "Time" },
  { key: "invoices", label: "Invoices" },
  { key: "contracts", label: "Contracts" },
];

export default function ClientDetailModal({
  client,
  userId,
  onClose,
  onNotesSaved,
}: {
  client: ClientRecord;
  userId: string;
  onClose: () => void;
  onNotesSaved: (notes: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">{client.name}</h2>
          <button
            onClick={onClose}
            className="rounded border border-ink/15 px-2 py-1 text-sm text-slate-500"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-ink/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-teal text-ink"
                  : "text-slate-400 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "notes" && <NotesTab client={client} onSaved={onNotesSaved} />}
          {tab === "time" && <TimeTab clientId={client.id} userId={userId} />}
          {tab === "invoices" && (
            <InvoicesTab
              clientId={client.id}
              userId={userId}
              defaultFixedFeePence={client.value_pence}
            />
          )}
          {tab === "contracts" && (
            <ContractsTab clientId={client.id} userId={userId} />
          )}
        </div>
      </div>
    </div>
  );
}
