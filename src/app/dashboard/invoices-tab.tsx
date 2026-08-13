"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus } from "@/lib/types";

function formatGBP(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export default function InvoicesTab({
  clientId,
  userId,
  defaultFixedFeePence,
}: {
  clientId: string;
  userId: string;
  defaultFixedFeePence: number | null;
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [unbilledMinutes, setUnbilledMinutes] = useState(0);
  const [rate, setRate] = useState("50");
  const [fixedAmount, setFixedAmount] = useState(
    defaultFixedFeePence ? (defaultFixedFeePence / 100).toString() : ""
  );
  const [basis, setBasis] = useState<"time" | "fixed">("time");
  const [generating, setGenerating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [{ data: invoiceData }, { data: timeData }] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("time_entries")
          .select("minutes")
          .eq("client_id", clientId)
          .is("invoice_id", null),
      ]);
      setInvoices((invoiceData ?? []) as Invoice[]);
      setUnbilledMinutes(
        (timeData ?? []).reduce((sum, e) => sum + (e.minutes as number), 0)
      );
    }
    load();
  }, [clientId]);

  async function generateInvoice() {
    setGenerating(true);

    let amount_pence: number;
    if (basis === "time") {
      const hourlyRatePence = Math.round(parseFloat(rate || "0") * 100);
      amount_pence = Math.round((unbilledMinutes / 60) * hourlyRatePence);
    } else {
      amount_pence = Math.round(parseFloat(fixedAmount || "0") * 100);
    }

    if (!amount_pence || amount_pence <= 0) {
      setGenerating(false);
      alert("Enter a valid amount first.");
      return;
    }

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({ client_id: clientId, user_id: userId, amount_pence, basis, status: "draft" })
      .select()
      .single();

    if (error || !invoice) {
      setGenerating(false);
      alert("Could not create the invoice — please try again.");
      return;
    }

        if (basis === "time") {
      const { data: billed, error: billError } = await supabase
        .from("time_entries")
        .update({ invoice_id: invoice.id })
        .eq("client_id", clientId)
        .is("invoice_id", null)
        .select("id");

      // A blocked update matches zero rows without raising an error, which
      // would leave these hours unbilled and let the next invoice charge for
      // them a second time. Only clear the counter once rows really changed.
      if (billError || (billed ?? []).length === 0) {
        alert(
          "Invoice created, but the tracked time could not be marked as billed — " +
            "those hours are still showing as unbilled. Check before sending."
        );
      } else {
        setUnbilledMinutes(0);
      }
    }

    setInvoices((prev) => [invoice as Invoice, ...(prev ?? [])]);
    setGenerating(false);
  }

  async function updateStatus(invoiceId: string, status: InvoiceStatus) {
    setInvoices((prev) =>
      (prev ?? []).map((i) => (i.id === invoiceId ? { ...i, status } : i))
    );
    await supabase.from("invoices").update({ status }).eq("id", invoiceId);
  }

  return (
    <div>
      <div className="rounded border border-ink/10 bg-[var(--paper-dim,#ECE7DC)] p-4">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={basis === "time"} onChange={() => setBasis("time")} />
            From tracked time
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={basis === "fixed"} onChange={() => setBasis("fixed")} />
            Fixed fee
          </label>
        </div>

        {basis === "time" ? (
          <div className="mt-3 text-sm">
            <p className="text-slate-500">Unbilled time: {(unbilledMinutes / 60).toFixed(1)}h</p>
            <label className="mt-2 block text-xs text-slate-500">£ per hour</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 w-28 rounded border border-ink/15 px-2 py-1.5 text-sm"
            />
          </div>
        ) : (
          <div className="mt-3 text-sm">
            <label className="block text-xs text-slate-500">Amount (£)</label>
            <input
              type="number"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              className="mt-1 w-28 rounded border border-ink/15 px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <button
          onClick={generateInvoice}
          disabled={generating}
          className="mt-3 rounded bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate invoice"}
        </button>
      </div>

      {invoices !== null && invoices.length > 0 && (
        <ul className="mt-4 space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between rounded border border-ink/10 p-3 text-sm"
            >
              <span className="font-mono font-medium">{formatGBP(inv.amount_pence)}</span>
              <span className="text-slate-400">{inv.basis}</span>
              <select
                value={inv.status}
                onChange={(e) => updateStatus(inv.id, e.target.value as InvoiceStatus)}
                className="rounded border border-ink/15 px-2 py-1 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {invoices !== null && invoices.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No invoices yet.</p>
      )}
    </div>
  );
}
