"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailConnection } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { PROVIDERS, findProvider } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { useFeedback } from "../feedback";

/** What an OAuth callback puts in `?inbox=`, in words. */
const OUTCOMES: Record<string, { text: string; tone: "ok" | "bad" }> = {
  connected: { text: "Inbox connected.", tone: "ok" },
  cancelled: { text: "Connection cancelled — nothing changed.", tone: "bad" },
  state: {
    text: "That sign-in link had expired. Please try connecting again.",
    tone: "bad",
  },
  norefresh: {
    text: "Your provider did not return a lasting permission. Remove Setu from your account's connected apps, then try again.",
    tone: "bad",
  },
  unconfigured: {
    text: "Mailbox connections are not set up on this deployment.",
    tone: "bad",
  },
  failed: { text: "Could not complete the connection. Please try again.", tone: "bad" },
};

export default function InboxCard({
  userId,
  connection,
  outcome,
}: {
  userId: string;
  connection: EmailConnection | null;
  /** From `?inbox=` after coming back from a provider's sign-in. */
  outcome?: string;
}) {
  const [current, setCurrent] = useState(connection);
  const [providerId, setProviderId] = useState<ProviderId>("gmail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const supabase = createClient();
  const { notify, confirm } = useFeedback();
  const message = outcome ? OUTCOMES[outcome] : undefined;
  const provider = findProvider(providerId)!;

  async function connectPassword(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/connect/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          email: email.trim(),
          password,
          host: host.trim(),
          port: Number(port) || 993,
        }),
      });
      const data = (await res.json()) as { error?: string; email?: string };

      if (!res.ok) {
        setFormError(data.error ?? "Could not connect.");
      } else {
        // Never keep the credential in component state once it is stored.
        setPassword("");
        setCurrent({
          provider: providerId,
          email_address: data.email ?? email.trim(),
          last_synced_at: null,
          needs_reauth: false,
          connected_at: new Date().toISOString(),
        });
        notify("Inbox connected.", "success");
      }
    } catch {
      setFormError("Could not reach the server.");
    }
    setConnecting(false);
  }

  async function syncNow() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as { filed?: number; error?: string };
      if (!res.ok) {
        notify(data.error ?? "Could not check.", "error");
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
      body: "Setu will stop reading your mail and the stored credential is deleted. Messages already filed against your clients are kept.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;

    setDisconnecting(true);
    // Delete is the one thing the browser may do to this row: the table has no
    // select, insert or update policy, so the credential is unreachable here.
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
            Connect your mailbox and mail to and from your clients is filed
            against them automatically — no tagging, no forwarding. Setu reads
            who, when and the subject line, never the message body, and only for
            addresses matching a client you have already added.
          </p>

          <fieldset className="mt-4">
            <legend className="label">Where is your email?</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProviderId(p.id);
                    setFormError(null);
                  }}
                  aria-pressed={providerId === p.id}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    providerId === p.id
                      ? "border-sky bg-sky text-white"
                      : "border-ink/15 bg-white text-slate-600 hover:border-sky/50 hover:text-sky"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          {provider.hint && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {provider.hint}
            </p>
          )}

          {provider.method === "oauth" ? (
            <a href="/api/connect/microsoft" className="btn-primary mt-4 inline-block">
              Sign in with {provider.label}
            </a>
          ) : (
            <form onSubmit={connectPassword} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={provider.id === "custom" ? "" : "sm:col-span-2"}>
                  <label className="label" htmlFor="inbox-email">
                    Email address
                  </label>
                  <input
                    id="inbox-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field mt-1"
                    placeholder="you@yourdomain.co.uk"
                    autoComplete="username"
                  />
                </div>

                {provider.id === "custom" && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <label className="label" htmlFor="inbox-host">
                        IMAP server
                      </label>
                      <input
                        id="inbox-host"
                        required
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        className="field mt-1"
                        placeholder="imap.yourhost.com"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="inbox-port">
                        Port
                      </label>
                      <input
                        id="inbox-port"
                        inputMode="numeric"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="field mt-1 w-20"
                      />
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="label" htmlFor="inbox-password">
                    App password
                  </label>
                  <input
                    id="inbox-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field mt-1 font-mono"
                    placeholder="••••••••••••••••"
                    autoComplete="off"
                  />
                  {provider.setupUrl && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      <a
                        href={provider.setupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky hover:underline"
                      >
                        Create one here
                      </a>{" "}
                      — not your normal password.
                    </p>
                  )}
                </div>
              </div>

              {formError && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={connecting}
                className="btn-primary mt-4"
                aria-busy={connecting}
              >
                {connecting ? "Checking the details…" : "Connect"}
              </button>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Stored encrypted, and only ever used to read your mail. Revoke it
                from your provider at any time and the connection stops working.
              </p>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 font-mono text-sm">{current.email_address}</p>

          {current.needs_reauth ? (
            <>
              <p className="mt-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
                Your mail server has stopped accepting the stored credential —
                usually because it was revoked or the password changed. Nothing
                is being filed until you reconnect.
              </p>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="btn-primary mt-3"
              >
                Reconnect
              </button>
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
