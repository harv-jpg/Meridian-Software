"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ContractView {
  id: string;
  title: string;
  body: string;
  status: string;
  signed_name: string | null;
  signed_at: string | null;
}

export default function SignPage() {
  const params = useParams();
  const token = params.token as string;

  const [contract, setContract] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_contract_by_token", {
        p_token: token,
      });
      if (error || !data || data.length === 0) {
        setError("This link isn't valid, or the contract can't be found.");
      } else {
        setContract(data[0] as ContractView);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const { error } = await supabase.rpc("sign_contract", {
      p_token: token,
      p_name: name.trim(),
    });

    setSubmitting(false);

    if (error) {
      setError("Could not save your signature — please try again.");
      return;
    }

    setContract((prev) =>
      prev
        ? { ...prev, status: "signed", signed_name: name.trim(), signed_at: new Date().toISOString() }
        : prev
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  if (error || !contract) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-slate-500">{error || "Contract not found."}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold">{contract.title}</h1>
        <pre className="mt-6 whitespace-pre-wrap rounded border border-ink/10 bg-white p-5 font-sans text-sm leading-relaxed">
          {contract.body}
        </pre>

        {contract.status === "signed" ? (
          <p className="mt-6 rounded border border-teal/40 bg-teal/10 p-4 text-sm">
            ✓ Signed by <strong>{contract.signed_name}</strong> on{" "}
            {contract.signed_at ? new Date(contract.signed_at).toLocaleString() : ""}
          </p>
        ) : (
          <form onSubmit={handleSign} className="mt-6 rounded border border-ink/10 bg-white p-5">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Type your full name to sign
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-2 w-full rounded border border-ink/15 px-3 py-2 text-sm"
              placeholder="Your full name"
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 rounded bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
            >
              {submitting ? "Signing…" : "Sign this agreement"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
