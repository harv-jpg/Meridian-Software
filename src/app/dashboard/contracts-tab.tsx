"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract, ContractStatus } from "@/lib/types";
import { formatDate } from "@/lib/format";

const TEMPLATE = `This is a simple working agreement between [Your Name] and [Client Name] for [brief description of the work].

Scope: [what you'll deliver]
Timeline: [start date] to [end date]
Fee: [amount and payment terms]

By signing below, both parties agree to these terms.

(This is a plain starting template, not legal advice — edit it to fit your actual agreement.)`;

const STATUS_STYLE: Record<ContractStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-600",
  sent: "border-gold/40 bg-gold/10 text-gold",
  signed: "border-teal/40 bg-teal/10 text-teal",
};

export default function ContractsTab({
  clientId,
  userId,
  contracts,
  setContracts,
}: {
  clientId: string;
  userId: string;
  contracts: Contract[];
  setContracts: React.Dispatch<React.SetStateAction<Contract[]>>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TEMPLATE);
  const [creating, setCreating] = useState(false);
  const [composing, setComposing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const supabase = createClient();

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

    setContracts((prev) => [data as Contract, ...prev]);
    setTitle("");
    setBody(TEMPLATE);
    setComposing(false);
  }

  async function markSent(contractId: string) {
    const previous = contracts;
    setContracts((prev) =>
      prev.map((c) => (c.id === contractId ? { ...c, status: "sent" } : c))
    );
    const { error } = await supabase
      .from("contracts")
      .update({ status: "sent" })
      .eq("id", contractId);
    if (error) {
      setContracts(previous);
      alert("Could not update the contract — please try again.");
    }
  }

  async function copyLink(contract: Contract) {
    const link = `${window.location.origin}/sign/${contract.sign_token}`;
    try {
      await navigator.clipboard.writeText(link);
      // Inline confirmation rather than an alert() that has to be dismissed.
      setCopiedId(contract.id);
      setTimeout(() => setCopiedId((id) => (id === contract.id ? null : id)), 2000);
    } catch {
      window.prompt("Copy this signing link:", link);
    }
  }

  return (
    <div>
      {composing ? (
        <div className="card animate-rise p-4">
          <label className="label" htmlFor="contract-title">
            Title
          </label>
          <input
            id="contract-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Website redesign agreement"
            className="field mt-1"
            autoFocus
          />

          <label className="label mt-4" htmlFor="contract-body">
            Terms
          </label>
          <textarea
            id="contract-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="field mt-1 resize-y leading-relaxed"
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={createContract}
              disabled={creating || !title.trim()}
              className="btn-primary"
            >
              {creating ? "Creating…" : "Create contract"}
            </button>
            <button onClick={() => setComposing(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setComposing(true)}
          className="w-full rounded-lg border border-dashed border-ink/20 px-4 py-3
                     text-sm font-medium text-slate-500 transition
                     hover:border-teal/50 hover:bg-teal/5 hover:text-teal"
        >
          + New contract
        </button>
      )}

      {contracts.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {contracts.map((c) => (
            <li key={c.id} className="card p-3.5 text-sm transition hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{c.title}</p>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[c.status]}`}
                >
                  {c.status}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-3 text-xs">
                {c.status === "draft" && (
                  <button
                    onClick={() => markSent(c.id)}
                    className="font-medium text-teal hover:underline"
                  >
                    Mark as sent &amp; get link
                  </button>
                )}
                {c.status === "sent" && (
                  <button
                    onClick={() => copyLink(c)}
                    className="font-medium text-teal hover:underline"
                  >
                    {copiedId === c.id ? "✓ Link copied" : "Copy signing link"}
                  </button>
                )}
                {c.status === "signed" && (
                  <span className="text-slate-500">
                    Signed by <strong className="font-medium">{c.signed_name}</strong>
                    {c.signed_at ? ` on ${formatDate(c.signed_at)}` : ""}
                  </span>
                )}
                <span className="ml-auto text-slate-400">
                  {formatDate(c.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !composing && (
          <p className="mt-5 rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-slate-400">
            No contracts yet.
          </p>
        )
      )}
    </div>
  );
}
