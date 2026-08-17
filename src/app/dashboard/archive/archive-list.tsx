"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_META } from "@/lib/stages";
import { formatDate, formatGBP } from "@/lib/format";
import { useFeedback } from "../feedback";
import type { ClientRecord } from "@/lib/types";

export default function ArchiveList({
  initialClients,
}: {
  initialClients: ClientRecord[];
}) {
  const [clients, setClients] = useState(initialClients);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const supabase = createClient();
  const { notify } = useFeedback();

  async function restore(client: ClientRecord) {
    setRestoringId(client.id);

    // Clearing archived_at is all it takes — the stage was never changed, so
    // the client reappears exactly where it left the board.
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: null })
      .eq("id", client.id);

    setRestoringId(null);

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
            </div>
            <button
              onClick={() => restore(client)}
              disabled={restoringId === client.id}
              className="btn-ghost shrink-0"
            >
              {restoringId === client.id ? "Restoring…" : "Restore"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
