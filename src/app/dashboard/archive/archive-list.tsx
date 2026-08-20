"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_META } from "@/lib/stages";
import { formatDate, formatGBP } from "@/lib/format";
import { useFeedback } from "../feedback";
import type { ClientRecord } from "@/lib/types";
import { describeAttached } from "@/lib/archive";
import type { AttachedCounts } from "@/lib/archive";

export default function ArchiveList({
  initialClients,
  attached,
}: {
  initialClients: ClientRecord[];
  /** Keyed by client id; counted on the server so the warning can be specific. */
  attached: Record<string, AttachedCounts>;
}) {
  const [clients, setClients] = useState(initialClients);
  const [busyId, setBusyId] = useState<string | null>(null);

  const supabase = createClient();
  const { notify, confirm } = useFeedback();

  async function restore(client: ClientRecord) {
    setBusyId(client.id);

    // Clearing archived_at is all it takes — the stage was never changed, so
    // the client reappears exactly where it left the board.
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: null })
      .eq("id", client.id);

    setBusyId(null);

    if (error) {
      notify("Could not restore — please try again.", "error");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    notify(
      `${client.name} restored to ${STAGE_META[client.stage].label}.`,
      "success"
    );
  }

  /**
   * Deleting is offered even when there is billing history attached, which the
   * client drawer refuses. Refusing outright leaves no way to honour an erasure
   * request, and the records are the user's to keep or destroy — so the answer
   * is to be specific about the cost rather than to decide for them.
   */
  async function remove(client: ClientRecord) {
    const summary = describeAttached(attached[client.id]);

    const ok = await confirm({
      title: `Delete ${client.name} permanently?`,
      body: summary
        ? `This also deletes their ${summary}. If any of it is billing history you need for your accounts, export or save it first — this cannot be undone.`
        : "There is nothing billed against them, so nothing else is lost. This cannot be undone.",
      confirmLabel: "Delete permanently",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(client.id);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setBusyId(null);

    if (error) {
      notify("Could not delete — please try again.", "error");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    notify(`${client.name} deleted.`, "success");
  }

  if (clients.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink/15 px-4 py-10 text-center text-sm text-slate-400">
        Nothing archived. Clients you finish with will collect here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {clients.map((client) => {
        const stage = STAGE_META[client.stage];
        const summary = describeAttached(attached[client.id]);
        const busy = busyId === client.id;

        return (
          <li
            key={client.id}
            className="card flex flex-wrap items-center gap-3 p-4 transition hover:shadow-lift"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{client.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {stage.label} · {formatGBP(client.value_pence)}
                {client.archived_at && (
                  <> · archived {formatDate(client.archived_at)}</>
                )}
              </p>
              {/* Shown before anyone reaches for Delete, not only inside the
                  confirmation, so the cost is visible while deciding. */}
              {summary && (
                <p className="mt-1 text-xs text-slate-500">Holds {summary}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => restore(client)}
                disabled={busy}
                className="btn-ghost"
              >
                Restore
              </button>
              <button
                onClick={() => remove(client)}
                disabled={busy}
                aria-label={`Delete ${client.name} permanently`}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-400
                           transition hover:bg-red-50 hover:text-red-600
                           disabled:opacity-60"
              >
                {busy ? "Working…" : "Delete"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
