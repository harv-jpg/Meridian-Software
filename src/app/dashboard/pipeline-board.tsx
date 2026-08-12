"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Stage } from "@/lib/types";
import ClientDetailModal from "./client-detail-modal";

const STAGES: { key: Stage; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "negotiating", label: "Negotiating" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

function formatGBP(pence: number | null) {
  if (pence === null) return "—";
  return `£${(pence / 100).toFixed(2)}`;
}

export default function PipelineBoard({
  clients,
  setClients,
  userId,
}: {
  clients: ClientRecord[];
  setClients: React.Dispatch<React.SetStateAction<ClientRecord[]>>;
  userId: string;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

  const supabase = createClient();
  const selectedClient = clients.find((c) => c.id === selectedId) ?? null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError("");

    const value_pence = value ? Math.round(parseFloat(value) * 100) : null;

    const { data, error } = await supabase
      .from("clients")
      .insert({ name: name.trim(), stage: "lead", value_pence, user_id: userId })
      .select()
      .single();

    setAdding(false);

    if (error || !data) {
      setError(error?.message ?? "Something went wrong adding this client.");
      return;
    }

    setClients((prev) => [data as ClientRecord, ...prev]);
    setName("");
    setValue("");
  }

  async function moveToStage(clientId: string, newStage: Stage) {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, stage: newStage } : c))
    );
    const { error } = await supabase
      .from("clients")
      .update({ stage: newStage })
      .eq("id", clientId);
    if (error) alert("Could not update stage — please refresh and try again.");
  }

  async function handleDelete(clientId: string) {
    const confirmed = window.confirm("Delete this client? This can't be undone.");
    if (!confirmed) return;

    const previous = clients;
    setClients((prev) => prev.filter((c) => c.id !== clientId));

    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) {
      setClients(previous);
      alert("Could not delete — please try again.");
    }
  }

  function handleNotesSaved(notes: string) {
    if (!selectedId) return;
    setClients((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, notes } : c))
    );
  }

  function handleDragStart(clientId: string) {
    setDraggingId(clientId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  function handleDragOverColumn(e: React.DragEvent, stage: Stage) {
    e.preventDefault();
    setDragOverStage(stage);
  }

  function handleDropOnColumn(e: React.DragEvent, stage: Stage) {
    e.preventDefault();
    setDragOverStage(null);
    if (draggingId) {
      moveToStage(draggingId, stage);
    }
    setDraggingId(null);
  }

  return (
    <div>
      <form
        onSubmit={handleAdd}
        className="mb-8 flex flex-wrap items-end gap-3 rounded border border-ink/10 bg-white p-4"
      >
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Client name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 rounded border border-ink/15 px-3 py-2 text-sm"
            placeholder="e.g. Marlowe Studio"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Est. value (£)
          </label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-32 rounded border border-ink/15 px-3 py-2 text-sm"
            placeholder="1500"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add lead"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>

      <div className="grid gap-4 md:grid-cols-5">
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            onDragOver={(e) => handleDragOverColumn(e, stage.key)}
            onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
            onDrop={(e) => handleDropOnColumn(e, stage.key)}
            className={`rounded-md p-2 transition ${
              dragOverStage === stage.key ? "bg-teal/10 ring-2 ring-teal/40" : ""
            }`}
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stage.label} · {clients.filter((c) => c.stage === stage.key).length}
            </h3>
            <div className="space-y-2 min-h-[40px]">
              {clients
                .filter((c) => c.stage === stage.key)
                .map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => handleDragStart(c.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-grab rounded border border-ink/10 bg-white p-3 text-sm transition active:cursor-grabbing hover:border-teal/50 hover:shadow-sm ${
                      draggingId === c.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{c.name}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id);
                        }}
                        title="Delete client"
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {formatGBP(c.value_pence)}
                    </div>
                  </div>
                ))}
              {clients.filter((c) => c.stage === stage.key).length === 0 && (
                <p className="text-xs text-slate-400">Drop here</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onNotesSaved={handleNotesSaved}
        />
      )}
    </div>
  );
}
