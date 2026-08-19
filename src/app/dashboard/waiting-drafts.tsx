"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Nudge } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useFeedback } from "./feedback";

/**
 * Drafts the nightly job wrote while nobody was here.
 *
 * Sits above Needs attention because it is the one part of the dashboard
 * carrying work that is already done. Everything else on this screen tells you
 * what to do; this tells you what has been done for you.
 *
 * Sending is still manual and still leaves the app — there is no send button
 * here, only Copy and a mailto. Marking one sent records what you did; it does
 * not do it.
 */
export default function WaitingDrafts({
  nudges,
  clients,
  onResolved,
}: {
  nudges: Nudge[];
  clients: ClientRecord[];
  onResolved: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const supabase = createClient();
  const { notify, confirm } = useFeedback();
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  if (nudges.length === 0) return null;

  function open(nudge: Nudge) {
    setOpenId(nudge.id);
    setSubject(nudge.subject);
    setBody(nudge.body);
    setCopied(false);
  }

  async function resolve(nudge: Nudge, status: "sent" | "dismissed") {
    if (status === "dismissed") {
      const ok = await confirm({
        title: "Dismiss this draft?",
        body: "It will not be written again for the same reason. You can still draft one by hand from the client.",
        confirmLabel: "Dismiss",
        destructive: true,
      });
      if (!ok) return;
    }

    setBusyId(nudge.id);
    const { error } = await supabase
      .from("nudges")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", nudge.id);
    setBusyId(null);

    if (error) {
      notify("Could not update that draft — please try again.", "error");
      return;
    }
    if (openId === nudge.id) setOpenId(null);
    onResolved(nudge.id);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Could not reach the clipboard — select the text and copy it.", "error");
    }
  }

  return (
    <section
      aria-label="Drafts waiting for you"
      className="mb-6 overflow-hidden rounded-lg border border-plum/25 bg-white shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-plum/20 bg-plum/[0.06] px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-plum">
          <span className="h-1.5 w-1.5 rounded-full bg-plum" aria-hidden="true" />
          Waiting for you
        </h2>
        <span className="font-mono text-xs text-slate-400">{nudges.length}</span>
      </div>

      <ul className="divide-y divide-ink/10">
        {nudges.map((nudge) => {
          const client = clientsById.get(nudge.client_id);
          const isOpen = openId === nudge.id;

          return (
            <li key={nudge.id}>
              <button
                onClick={() => (isOpen ? setOpenId(null) : open(nudge))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm
                           transition hover:bg-ink/[0.03]"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-plum" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {client?.name ?? "Unknown client"}
                  </span>
                  <span className="ml-2 text-slate-500">
                    {nudge.kind === "payment"
                      ? "payment reminder drafted"
                      : "nudge drafted"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(nudge.created_at)}
                </span>
                <span
                  className="shrink-0 text-xs text-slate-300"
                  aria-hidden="true"
                >
                  {isOpen ? "▾" : "▸"}
                </span>
              </button>

              {isOpen && (
                <div className="animate-rise border-t border-ink/10 bg-ink/[0.02] px-4 py-4">
                  <p className="text-xs italic text-slate-500">{nudge.angle}</p>

                  <label className="label mt-3" htmlFor={`n-subject-${nudge.id}`}>
                    Subject
                  </label>
                  <input
                    id={`n-subject-${nudge.id}`}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="field mt-1 bg-white"
                  />

                  <label className="label mt-3" htmlFor={`n-body-${nudge.id}`}>
                    Message
                  </label>
                  <textarea
                    id={`n-body-${nudge.id}`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={9}
                    className="field mt-1 resize-y bg-white leading-relaxed"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button onClick={copy} className="btn-primary">
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                    {client?.email ? (
                      <a
                        href={`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                        className="btn-ghost"
                      >
                        Open in email
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">
                        No email on this client
                      </span>
                    )}

                    <button
                      onClick={() => resolve(nudge, "sent")}
                      disabled={busyId === nudge.id}
                      className="btn-ghost"
                    >
                      Mark as sent
                    </button>
                    <button
                      onClick={() => resolve(nudge, "dismissed")}
                      disabled={busyId === nudge.id}
                      className="ml-auto text-xs font-medium text-slate-400 transition hover:text-red-600"
                    >
                      Dismiss
                    </button>
                  </div>

                  <p className="mt-3 border-t border-ink/10 pt-3 text-xs text-slate-400">
                    Written overnight from this client&rsquo;s record. Read it
                    before you send it — nothing here has gone anywhere.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
