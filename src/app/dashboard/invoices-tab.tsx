"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus, TimeEntry } from "@/lib/types";
import { formatDate, formatGBP, formatHours } from "@/lib/format";

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-600",
  sent: "border-gold/40 bg-gold/10 text-gold",
  paid: "border-teal/40 bg-teal/10 text-teal",
};

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export default function InvoicesTab({
  clientId,
  userId,
  invoices,
  setInvoices,
  timeEntries,
  setTimeEntries,
  defaultFixedFeePence,
}: {
  clientId: string;
  userId: string;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  timeEntries: TimeEntry[];
  setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  defaultFixedFeePence: number | null;
}) {
  const [rate, setRate] = useState("50");
  const [fixedAmount, setFixedAmount] = useState(
    defaultFixedFeePence ? (defaultFixedFeePence / 100).toString() : ""
  );
  const [basis, setBasis] = useState<"time" | "fixed">("time");
  const [generating, setGenerating] = useState(false);

  const supabase = createClient();

  // Derived from the drawer's shared time entries, so logging time in the
  // Time tab updates this figure immediately instead of leaving it stale
  // until the panel is reopened.
  const unbilledMinutes = timeEntries
    .filter((e) => e.invoice_id === null)
    .reduce((sum, e) => sum + e.minutes, 0);

  const hourlyRatePence = Math.round(parseFloat(rate || "0") * 100);
  const previewPence =
    basis === "time"
      ? Math.round((unbilledMinutes / 60) * hourlyRatePence)
      : Math.round(parseFloat(fixedAmount || "0") * 100);

  // Keep the fixed-fee field in step if the client's estimated value changes.
  useEffect(() => {
    if (basis === "fixed" && !fixedAmount && defaultFixedFeePence) {
      setFixedAmount((defaultFixedFeePence / 100).toString());
    }
  }, [basis, fixedAmount, defaultFixedFeePence]);

  async function generateInvoice() {
    if (!previewPence || previewPence <= 0) {
      alert("Enter a valid amount first.");
      return;
    }
    setGenerating(true);

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        client_id: clientId,
        user_id: userId,
        amount_pence: previewPence,
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
      const { data: billed, error: billError } = await supabase
        .from("time_entries")
        .update({ invoice_id: invoice.id })
        .eq("client_id", clientId)
        .is("invoice_id", null)
        .select("id");

      // A blocked update matches zero rows without raising an error, which
      // would leave these hours unbilled and let the next invoice charge for
      // them a second time. Only mark them billed once rows really changed.
      if (billError || (billed ?? []).length === 0) {
        alert(
          "Invoice created, but the tracked time could not be marked as billed — " +
            "those hours are still showing as unbilled. Check before sending."
        );
      } else {
        const billedIds = new Set((billed ?? []).map((r) => r.id as string));
        setTimeEntries((prev) =>
          prev.map((e) =>
            billedIds.has(e.id) ? { ...e, invoice_id: invoice.id as string } : e
          )
        );
      }
    }

    setInvoices((prev) => [invoice as Invoice, ...prev]);
    setGenerating(false);
  }

  async function updateStatus(invoiceId: string, status: InvoiceStatus) {
    const previous = invoices;
    setInvoices((prev) =>
      prev.map((i) => (i.id === invoiceId ? { ...i, status } : i))
    );
    const { error } = await supabase
      .from("invoices")
      .update({ status })
      .eq("id", invoiceId);
    if (error) {
      setInvoices(previous);
      alert("Could not update the invoice — please try again.");
    }
  }

  return (
    <div>
      <div className="card overflow-hidden">
        <div className="flex border-b border-ink/10">
          {(["time", "fixed"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                basis === b
                  ? "bg-ink/5 text-ink"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {b === "time" ? "From tracked time" : "Fixed fee"}
            </button>
          ))}
        </div>

        <div className="p-4">
          {basis === "time" ? (
            <div className="flex items-end gap-4">
              <div>
                <label className="label" htmlFor="rate">
                  £ per hour
                </label>
                <input
                  id="rate"
                  type="number"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="field mt-1 w-24"
                />
              </div>
              <p className="pb-2 text-sm text-slate-500">
                × {formatHours(unbilledMinutes)} unbilled
              </p>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="fixed">
                Amount (£)
              </label>
              <input
                id="fixed"
                type="number"
                min="0"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                className="field mt-1 w-32"
              />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
            <div>
              <span className="label">Invoice total</span>
              <p className="font-mono text-xl font-semibold">
                {formatGBP(previewPence)}
              </p>
            </div>
            <button
              onClick={generateInvoice}
              disabled={generating || previewPence <= 0}
              className="btn-primary"
            >
              {generating ? "Generating…" : "Generate invoice"}
            </button>
          </div>

          {basis === "time" && unbilledMinutes === 0 && (
            <p className="mt-3 text-xs text-slate-400">
              No unbilled time for this client — log some in the Time tab, or
              switch to a fixed fee.
            </p>
          )}
        </div>
      </div>

      {invoices.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="card flex items-center justify-between gap-3 p-3 text-sm
                         transition hover:shadow-lift"
            >
              <div>
                <p className="font-mono text-base font-semibold">
                  {formatGBP(inv.amount_pence)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {inv.basis === "time" ? "Time-based" : "Fixed fee"} ·{" "}
                  {formatDate(inv.created_at)}
                </p>
              </div>
              {/* The control is the status indicator — showing a separate
                  read-only pill next to it just said the same thing twice. */}
              <select
                value={inv.status}
                onChange={(e) =>
                  updateStatus(inv.id, e.target.value as InvoiceStatus)
                }
                aria-label="Invoice status"
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs
                            font-medium capitalize transition focus:outline-none
                            focus:ring-2 focus:ring-teal/25 ${STATUS_STYLE[inv.status]}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-white text-ink">
                    {s}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-slate-400">
          No invoices yet.
        </p>
      )}
    </div>
  );
}
