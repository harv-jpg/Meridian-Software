"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Stage } from "@/lib/types";
import TimeTracker from "./time-tracker";
import InvoicePanel from "./invoice-panel";

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
  const [openNotesId, setOpenNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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

  function openNotes(client: ClientRecord) {
    setOpenNotesId(client.id);
    setNotesDraft(client.notes ?? "");
  }

  async function saveNotes(clientId: string) {
    setSavingNotes(true);

    const { error } = await supabase
      .from("clients")
      .update({ notes: notesDraft })
      .eq("id", clientId);

    setSavingNotes(false);

    if (error) {
      alert("Could not save notes — please try again.");
      return;
    }

    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, notes: notesDraft } : c))
    );
    setOpenNotesId(null);
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{c.name}</div>
                      <button
                        onClick={() => handleDelete(c.id)}
                        title="Delete client"
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
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

                    {openNotesId === c.id ? (
                      <div className="mt-2">
                        <textarea
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          rows={3}
                          className="w-full rounded border border-ink/15 px-2 py-1 text-xs"
                          placeholder="Notes on this client…"
                        />
                        <div className="mt-1 flex gap-2">
                          <button
                            onClick={() => saveNotes(c.id)}
                            disabled={savingNotes}
                            className="rounded bg-ink px-2 py-1 text-xs font-medium text-paper disabled:opacity-60"
                          >
                            {savingNotes ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setOpenNotesId(null)}
                            className="rounded border border-ink/15 px-2 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openNotes(c)}
                        className="mt-2 text-left text-xs text-teal underline"
                      >
                        {c.notes ? "Edit notes" : "Add notes"}
                      </button>
                    )}

                    <TimeTracker clientId={c.id} userId={userId} />
                    <InvoicePanel
                      clientId={c.id}
                      userId={userId}
                      defaultFixedFeePence={c.value_pence}
                    />
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
