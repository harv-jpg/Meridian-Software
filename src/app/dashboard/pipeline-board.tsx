"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Stage } from "@/lib/types";
import { STAGES } from "@/lib/stages";
import { formatGBP, formatGBPShort } from "@/lib/format";
import ClientDetailDrawer from "./client-detail-drawer";

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
    const previous = clients;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, stage: newStage } : c))
    );
    const { error } = await supabase
      .from("clients")
      .update({ stage: newStage })
      .eq("id", clientId);
    if (error) {
      setClients(previous);
      alert("Could not update stage — please try again.");
    }
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

  function handleStageChange(stage: Stage) {
    if (!selectedId) return;
    setClients((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, stage } : c))
    );
  }

  return (
    <div>
      <form
        onSubmit={handleAdd}
        className="card mb-8 flex flex-wrap items-end gap-3 p-4"
      >
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="new-name">
            Client name
          </label>
          <input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="field mt-1"
            placeholder="e.g. Marlowe Studio"
          />
        </div>
        <div>
          <label className="label" htmlFor="new-value">
            Est. value (£)
          </label>
          <input
            id="new-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            className="field mt-1 w-32"
            placeholder="1500"
          />
        </div>
        <button type="submit" disabled={adding} className="btn-primary">
          {adding ? "Adding…" : "Add lead"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
      {/* Dragging relies on the HTML5 drag-and-drop API, which never fires on
          touch devices. The drawer's stage switcher is the equivalent there,
          so point to it rather than leaving a dead gesture. */}
      <p className="mb-3 rounded-md bg-ink/5 px-3 py-2 text-xs text-slate-500 md:hidden">
        Tap a client to open it — you can change its stage from inside. Dragging
        cards between columns works on a larger screen.
      </p>

      <div className="grid gap-3 md:grid-cols-5">
        {STAGES.map((stage) => {
          const inStage = clients.filter((c) => c.stage === stage.key);
          const stageValue = inStage.reduce(
            (sum, c) => sum + (c.value_pence ?? 0),
            0
          );
          const isDropTarget = dragOverStage === stage.key;

          return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.key);
              }}
              onDragLeave={() =>
                setDragOverStage((prev) => (prev === stage.key ? null : prev))
              }
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                if (draggingId) moveToStage(draggingId, stage.key);
                setDraggingId(null);
              }}
              className={`rounded-lg p-2 transition ${
                isDropTarget ? stage.dropZone : "ring-2 ring-transparent"
              }`}
            >
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {stage.label}
                </h3>
                <span className="ml-auto font-mono text-xs text-slate-400">
                  {inStage.length}
                </span>
              </div>

              {stageValue > 0 && (
                <p className="mb-2 px-1 font-mono text-[11px] text-slate-400">
                  {formatGBPShort(stageValue)}
                </p>
              )}

              <div className="min-h-[60px] space-y-2">
                {inStage.map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setDraggingId(c.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStage(null);
                    }}
                    onClick={() => setSelectedId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(c.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={`group relative cursor-grab overflow-hidden rounded-lg border
                                border-ink/10 bg-white p-3 pl-4 text-sm shadow-card transition
                                active:cursor-grabbing hover:-translate-y-0.5 hover:border-ink/20
                                hover:shadow-lift ${
                                  draggingId === c.id
                                    ? "rotate-1 opacity-50"
                                    : ""
                                }`}
                  >
                    {/* Stage accent, so a card still reads as its stage when
                        dragged away from its column. */}
                    <span
                      className={`absolute inset-y-0 left-0 w-1 ${stage.bar}`}
                      aria-hidden="true"
                    />

                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium leading-snug">{c.name}</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id);
                        }}
                        aria-label={`Delete ${c.name}`}
                        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-xs text-slate-300
                                   opacity-0 transition hover:bg-red-50 hover:text-red-600
                                   focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">
                        {formatGBP(c.value_pence)}
                      </span>
                      {c.notes && (
                        <span
                          title="Has notes"
                          className="text-xs text-slate-300"
                          aria-label="Has notes"
                        >
                          ✎
                        </span>
                      )}
                    </div>
                  </article>
                ))}

                {inStage.length === 0 && (
                  <p
                    className={`rounded-lg border border-dashed px-2 py-4 text-center text-xs transition ${
                      isDropTarget
                        ? "border-transparent text-slate-500"
                        : "border-ink/10 text-slate-300"
                    }`}
                  >
                    {isDropTarget ? "Drop here" : "Empty"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedClient && (
        <ClientDetailDrawer
          // Keyed so switching clients resets the panel's tab and drafts
          // instead of carrying one client's state into another.
          key={selectedClient.id}
          client={selectedClient}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onNotesSaved={handleNotesSaved}
          onStageChange={handleStageChange}
        />
      )}
    </div>
  );
}
