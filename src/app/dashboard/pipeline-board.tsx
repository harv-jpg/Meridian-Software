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
                </
