"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus } from "@/lib/types";

function formatGBP(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export default function InvoicePanel({
  clientId,
  userId,
  defaultFixedFeePence,
}: {
  clientId: string;
  userId: string;
  defaultFixedFeePence: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [unbilledMinutes, setUnbilledMinutes] = useState(0);
  const [rate, setRate] = useState("50");
  const [fixedAmount, setFixedAmount] = useState(
    defaultFixedFeePence ? (defaultFixedFeePence / 100).toString() : ""
  );
  const [basis, setBasis] = useState<"time" | "fixed">("time");
  const [generating, setGenerating] = useState(false);

  const supabase = createClient();

  async function loadData() {
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

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && invoices === null) loadData();
  }

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
      .insert({
        client_id: clientId,
        user_id: userId,
        amount_pence,
        basis,
        status: "draft",
      })
      .select()
      .single();

    if (error || !invoice) {
      setGenerating(false);
      alert("Could not create the invoice — please try again.");
      return;
    }

    if (basis === "time") {
      await supabase
        .from("time_entries")
        .update({ invoice_id: invoice.id })
        .eq("client_id", clientId)
        .is("invoice_id", null);
      setUnbilledMinutes(0);
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
    <div className="mt-2">
      <button onClick={toggleOpen} className="text-left text-xs text-teal underline">
        {open ? "Hide invoices" : "Invoices"}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded border border-ink/10 bg-[var(--paper-dim,#ECE7DC)] p-2">
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={basis === "time"}
                onChange={() => setBasis("time")}
              />
              From time
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={basis === "fixed"}
                onChange={() => setBasis("fixed")}
              />
              Fixed fee
            </label>
          </div>

          {basis === "time" ? (
            <div className="text-xs">
              <p className="text-slate-500">
                Unbilled time: {(unbilledMinutes / 60).toFixed(1)}h
              </p>
              <label className="mt-1 block text-slate-500">£/hour</label>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="mt-1 w-24 rounded border border-ink/15 px-2 py-1"
              />
            </div>
          ) : (
            <div className="text-xs">
              <label className="block text-slate-500">Amount (£)</label>
              <input
                type="number"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                className="mt-1 w-24 rounded border border-ink/15 px-2 py-1"
              />
            </div>
          )}

          <button
            onClick={generateInvoice}
            disabled={generating}
            className="rounded bg-ink px-2 py-1 text-xs font-medium text-paper disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate invoice"}
          </button>

          {invoices !== null && invoices.length > 0 && (
            <ul className="space-y-1 border-t border-ink/10 pt-2">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{formatGBP(inv.amount_pence)}</span>
                  <span className="text-slate-400">{inv.basis}</span>
                  <select
                    value={inv.status}
                    onChange={(e) =>
                      updateStatus(inv.id, e.target.value as InvoiceStatus)
                    }
                    className="rounded border border-ink/15 px-1 py-0.5 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
