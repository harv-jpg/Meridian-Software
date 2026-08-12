"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract } from "@/lib/types";

const TEMPLATE = `This is a simple working agreement between [Your Name] and [Client Name] for [brief description of the work].

Scope: [what you'll deliver]
Timeline: [start date] to [end date]
Fee: [amount and payment terms]

By signing below, both parties agree to these terms.

(This is a plain starting template, not legal advice — edit it to fit your actual agreement.)`;

export default function ContractsTab({
  clientId,
  userId,
}: {
  clientId: string;
  userId: string;
}) {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TEMPLATE);
  const [creating, setCreating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("contracts")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setContracts((data ?? []) as Contract[]);
    }
    load();
  }, [clientId]);

  async function createContract() {
    if (!title.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("contracts")
      .insert({ client_id: clientId, user_id: userId, title: title.trim(), body, status: "draft" })
      .select()
      .single();

    setCreating(false);

    if (error || !data) {
      alert("Could not create the contract — please try again.");
      return;
    }

    setContracts((prev) => [data as Contract, ...(prev ?? [])]);
    setTitle("");
  }

  async function markSent(contractId: string) {
    setContracts((prev) =>
      (prev ?? []).map((c) => (c.id === contractId ? { ...c, status: "sent" } : c))
    );
    await supabase.from("contracts").update({ status: "sent" }).eq("id", contractId);
  }

  function signingLink(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/sign/${token}`;
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(signingLink(token));
    alert("Link copied — send it to your client.");
  }

  return (
    <div>
      <div className="rounded border border-ink/10 bg-[var(--paper-dim,#ECE7DC)] p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Contract title, e.g. Website redesign agreement"
          className="w-full rounded border border-ink/15 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-3 w-full rounded border border-ink/15 px-3 py-2 text-sm"
        />
        <button
          onClick={createContract}
          disabled={creating}
          className="mt-3 rounded bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {creating ? "Creating…" : "Create contract"}
        </button>
      </div>

      {contracts !== null && contracts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {contracts.map((c) => (
            <li key={c.id} className="rounded border border-ink/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.title}</span>
                <span className="text-slate-400">{c.status}</span>
              </div>
              {c.status === "draft" && (
                <button onClick={() => markSent(c.id)} className="mt-1 text-teal underline">
                  Mark as sent &amp; get link
                </button>
              )}
              {c.status === "sent" && (
                <button onClick={() => copyLink(c.sign_token)} className="mt-1 text-teal underline">
                  Copy signing link
                </button>
              )}
              {c.status === "signed" && (
                <p className="mt-1 text-slate-500">
                  Signed by {c.signed_name} on{" "}
                  {c.signed_at ? new Date(c.signed_at).toLocaleDateString() : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {contracts !== null && contracts.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No contracts yet.</p>
      )}
    </div>
  );
}
