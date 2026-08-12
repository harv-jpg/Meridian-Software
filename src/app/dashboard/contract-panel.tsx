"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract } from "@/lib/types";

const TEMPLATE = `This is a simple working agreement between [Your Name] and [Client Name] for [brief description of the work].

Scope: [what you'll deliver]
Timeline: [start date] to [end date]
Fee: [amount and payment terms]

By signing below, both parties agree to these terms.

(This is a plain starting template, not legal advice — edit it to fit your actual agreement.)`;

export default function ContractPanel({
  clientId,
  userId,
}: {
  clientId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TEMPLATE);
  const [creating, setCreating] = useState(false);

  const supabase = createClient();

  async function loadContracts() {
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setContracts((data ?? []) as Contract[]);
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && contracts === null) loadContracts();
  }

  async function createContract() {
    if (!title.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        client_id: clientId,
        user_id: userId,
        title: title.trim(),
        body,
        status: "draft",
      })
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
    <div className="mt-2">
      <button onClick={toggleOpen} className="text-left text-xs text-teal underline">
        {open ? "Hide contracts" : "Contracts"}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded border border-ink/10 bg-[var(--paper-dim,#ECE7DC)] p-2">
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contract title, e.g. Website redesign agreement"
              className="w-full rounded border border-ink/15 px-2 py-1 text-xs"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded border border-ink/15 px-2 py-1 text-xs"
            />
            <button
              onClick={createContract}
              disabled={creating}
              className="mt-2 rounded bg-ink px-2 py-1 text-xs font-medium text-paper disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create contract"}
            </button>
          </div>

          {contracts !== null && contracts.length > 0 && (
            <ul className="space-y-2 border-t border-ink/10 pt-2">
              {contracts.map((c) => (
                <li key={c.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-slate-400">{c.status}</span>
                  </div>
                  {c.status === "draft" && (
                    <button
                      onClick={() => markSent(c.id)}
                      className="mt-1 text-teal underline"
                    >
                      Mark as sent &amp; get link
                    </button>
                  )}
                  {c.status === "sent" && (
                    <button
                      onClick={() => copyLink(c.sign_token)}
                      className="mt-1 text-teal underline"
                    >
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
        </div>
      )}
    </div>
  );
}
