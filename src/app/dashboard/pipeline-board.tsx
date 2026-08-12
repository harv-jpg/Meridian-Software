"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Stage } from "@/lib/types";

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
  initialClients,
  userId,
}: {
  initialClients: ClientRecord[];
  userId: string;
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

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

  async function handleStageChange(clientId: string, newStage: Stage) {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, stage: newStage } : c))
    );

    const { error } = await supabase
      .from("clients")
      .update({ stage: newStage })
      .eq("id", clientId);

    if (error) {
      alert("Could not update stage — please refresh and try again.");
    }
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
          <div key={stage.key}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stage.label} · {clients.filter((c) => c.stage === stage.key).length}
            </h3>
            <div className="space-y-2">
              {clients
                .filter((c) => c.stage === stage.key)
                .map((c) => (
                  <div
                    key={c.id}
                    className="rounded border border-ink/10 bg-white p-3 text-sm"
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {formatGBP(c.value_pence)}
                    </div>
                    <select
                      value={c.stage}
                      onChange={(e) =>
                        handleStageChange(c.id, e.target.value as Stage)
                      }
                      className="mt-2 w-full rounded border border-ink/15 px-2 py-1 text-xs"
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              {clients.filter((c) => c.stage === stage.key).length === 0 && (
                <p className="text-xs text-slate-400">No clients here yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
