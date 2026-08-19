"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailConnection } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useFeedback } from "../feedback";

/** What the OAuth callback puts in `?inbox=`, in words. */
const OUTCOMES: Record<string, { text: string; tone: "ok" | "bad" }> = {
  connected: { text: "Inbox connected.", tone: "ok" },
  cancelled: { text: "Connection cancelled — nothing changed.", tone: "bad" },
  state: {
    text: "That sign-in link had expired. Please try connecting again.",
    tone: "bad",
  },
  norefresh: {
    text: "Google did not return a lasting permission. Remove Setu at myaccount.google.com/permissions, then connect again.",
    tone: "bad",
  },
  unconfigured: {
    text: "Inbox sync is not set up on this deployment.",
    tone: "bad",
  },
  failed: { text: "Could not connect to Google. Please try again.", tone: "bad" },
};

export default function InboxCard({
  userId,
  connection,
  outcome,
}: {
  userId: string;
  connection: EmailConnection | null;
  /** From `?inbox=` after coming back from Google. */
  outcome?: string;
}) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [current, setCurrent] = useState(connection);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const supabase = createClient();
  const { notify, confirm } = useFeedback();
  const message = outcome ? OUTCOMES[outcome] : undefined;

  async function syncNow() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as {
        filed?: number;
        scanned?: number;
        error?: string;
      };

      if (!res.ok) {
        notify(data.error ?? "Could not sync.", "error");
      } else {
        setLastResult(
          data.filed === 0
            ? "Nothing new to file."
            : `Filed ${data.filed} message${data.filed === 1 ? "" : "s"}.`
        );
        setCurrent((c) =>
          c ? { ...c, last_synced_at: new Date().toISOString() } : c
        );
      }
    } catch {
      notify("Could not reach the server.", "error");
    }
    setSyncing(false);
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect this inbox?",
      body: "Setu will stop reading your mail. Messages already filed against your clients are kept — delete the client to remove those.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;

    setDisconnecting(true);
    // Delete is the one thing the browser may do to this row: the table has
    // no select, insert or update policy, so the tokens are unreachable here.
    const { error } = await supabase
      .from("email_accounts")
      .delete()
      .eq("user_id", userId);
    setDisconnecting(false);

    if (error) {
      notify("Could not disconnect — please try again.", "error");
      return;
    }
    setCurrent(null);
    notify("Inbox disconnected.", "success");
  }

  return (
    <div className="card mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-sky" aria-hidden="true" />
          Your inbox
        </h2>
        {current && !current.needs_reauth && (
          <span className="text-xs text-slate-400">
            {current.last_synced_at
              ? `Last checked ${formatDate(current.last_synced_at)}`
              : "Not checked yet"}
          </span>
        )}
      </div>

      {message && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            message.tone === "ok"
              ? "border-teal/30 bg-teal/5 text-teal"
              : "border-red-200 bg-red-50/60 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {current === null ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Connect Gmail and mail to and from your clients is filed against
            them automatically — no tagging, no forwarding. Setu reads message
            headers and Gmail&rsquo;s own one-line preview, and only for
            addresses that match a client you have already added.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Read-only: nothing here can send, delete or change your mail. You
            can revoke it at any time from your Google account.
          </p>
          <a href="/api/connect/google" className="btn-primary mt-4 inline-block">
            Connect Gmail
          </a>
        </>
      ) : (
        <>
          <p className="mt-2 font-mono text-sm">{current.email_address}</p>

          {current.needs_reauth ? (
            <>
              <p className="mt-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
                Google has stopped accepting this connection — usually because
                access was revoked, or it sat unused for six months. Nothing is
                being filed until you reconnect.
              </p>
              <a
                href="/api/connect/google"
                className="btn-primary mt-3 inline-block"
              >
                Reconnect
              </a>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Checked nightly. Only messages matching a client&rsquo;s email
              address are kept.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!current.needs_reauth && (
              <button
                onClick={syncNow}
                disabled={syncing}
                className="btn-ghost"
                aria-busy={syncing}
              >
                {syncing ? "Checking…" : "Check now"}
              </button>
            )}
            {lastResult && (
              <span className="animate-fade-in text-xs text-teal">{lastResult}</span>
            )}
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="ml-auto text-xs font-medium text-slate-400 transition hover:text-red-600"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
