"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isOverdue } from "@/lib/types";
import type { Invoice, InvoiceItem, InvoiceStatus, TimeEntry } from "@/lib/types";
import {
  formatQuantity,
  itemsTotalPence,
  lineTotalPence,
  parsePricePence,
  parseQuantity,
} from "@/lib/invoice";
import { formatDate, formatGBP, formatHours } from "@/lib/format";
import { sendByEmail } from "@/lib/send";

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-600",
  sent: "border-gold/40 bg-gold/10 text-gold",
  paid: "border-teal/40 bg-teal/10 text-teal",
};

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

/** Default payment terms, in days from today. */
const DEFAULT_TERMS_DAYS = 30;

function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function InvoicesTab({
  clientId,
  userId,
  invoices,
  setInvoices,
  timeEntries,
  setTimeEntries,
  items,
  setItems,
  clientEmail,
  clientName,
  defaultFixedFeePence,
}: {
  clientId: string;
  userId: string;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  timeEntries: TimeEntry[];
  setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  items: InvoiceItem[];
  setItems: React.Dispatch<React.SetStateAction<InvoiceItem[]>>;
  clientEmail: string | null;
  clientName: string;
  defaultFixedFeePence: number | null;
}) {
  const [rate, setRate] = useState("50");
  const [fixedAmount, setFixedAmount] = useState(
    defaultFixedFeePence ? (defaultFixedFeePence / 100).toString() : ""
  );
  const [basis, setBasis] = useState<"time" | "fixed">("time");
  const [dueDate, setDueDate] = useState(() => dateInDays(DEFAULT_TERMS_DAYS));
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const supabase = createClient();

  // Derived from the drawer's shared time entries, so logging time in the
  // Time tab updates this figure immediately.
  const unbilledMinutes = timeEntries
    .filter((e) => e.invoice_id === null)
    .reduce((sum, e) => sum + e.minutes, 0);

  const hourlyRatePence = Math.round(parseFloat(rate || "0") * 100);
  // Quantity is settled first and the preview derived from it, so the figure
  // on screen is exactly what the line item will store — otherwise rounding
  // the hours and rounding the total disagree by a few pence.
  const quantityCenti = Math.round((unbilledMinutes / 60) * 100);
  const previewPence =
    basis === "time"
      ? lineTotalPence({
          quantity_centi: quantityCenti,
          unit_price_pence: hourlyRatePence,
        })
      : Math.round(parseFloat(fixedAmount || "0") * 100);

  useEffect(() => {
    if (basis === "fixed" && !fixedAmount && defaultFixedFeePence) {
      setFixedAmount((defaultFixedFeePence / 100).toString());
    }
  }, [basis, fixedAmount, defaultFixedFeePence]);

  function itemsFor(invoiceId: string) {
    return items
      .filter((i) => i.invoice_id === invoiceId)
      .sort((a, b) => a.position - b.position);
  }

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
        due_date: dueDate || null,
      })
      .select()
      .single();

    if (error || !invoice) {
      setGenerating(false);
      alert("Could not create the invoice — please try again.");
      return;
    }

    // Every invoice starts with one line describing what it is for, so the
    // client always sees more than a bare total.
    const firstItem =
      basis === "time"
        ? {
            description: `Time worked (${formatHours(unbilledMinutes)})`,
            quantity_centi: quantityCenti,
            unit_price_pence: hourlyRatePence,
          }
        : {
            description: "Agreed fixed fee",
            quantity_centi: 100,
            unit_price_pence: previewPence,
          };

    const { data: itemRow } = await supabase
      .from("invoice_items")
      .insert({
        invoice_id: invoice.id,
        user_id: userId,
        position: 0,
        ...firstItem,
      })
      .select()
      .single();

    if (itemRow) setItems((prev) => [...prev, itemRow as InvoiceItem]);

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
    setExpandedId(invoice.id as string);
    setGenerating(false);
  }

  /** The database trigger recomputes the stored total; mirror it locally. */
  function syncTotal(invoiceId: string, nextItems: InvoiceItem[]) {
    const forInvoice = nextItems.filter((i) => i.invoice_id === invoiceId);
    if (forInvoice.length === 0) return;
    const total = itemsTotalPence(forInvoice);
    setInvoices((prev) =>
      prev.map((i) => (i.id === invoiceId ? { ...i, amount_pence: total } : i))
    );
  }

  async function addItem(
    invoiceId: string,
    description: string,
    quantityCenti: number,
    unitPricePence: number
  ) {
    const position = itemsFor(invoiceId).length;
    const { data, error } = await supabase
      .from("invoice_items")
      .insert({
        invoice_id: invoiceId,
        user_id: userId,
        description,
        quantity_centi: quantityCenti,
        unit_price_pence: unitPricePence,
        position,
      })
      .select()
      .single();

    if (error || !data) {
      alert("Could not add that line — please try again.");
      return;
    }
    const next = [...items, data as InvoiceItem];
    setItems(next);
    syncTotal(invoiceId, next);
  }

  async function removeItem(item: InvoiceItem) {
    const previous = items;
    const next = items.filter((i) => i.id !== item.id);
    setItems(next);
    syncTotal(item.invoice_id, next);

    const { error } = await supabase
      .from("invoice_items")
      .delete()
      .eq("id", item.id);
    if (error) {
      setItems(previous);
      syncTotal(item.invoice_id, previous);
      alert("Could not remove that line — please try again.");
    }
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

  async function copyLink(invoice: Invoice) {
    const link = `${window.location.origin}/invoice/${invoice.share_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invoice.id);
      setTimeout(
        () => setCopiedId((id) => (id === invoice.id ? null : id)),
        2000
      );
    } catch {
      window.prompt("Copy this invoice link:", link);
    }
  }

  async function emailInvoice(invoice: Invoice) {
    if (!clientEmail) return;
    // Sending leaves the app and cannot be taken back, so name the recipient
    // and make the user agree to it first.
    const ok = window.confirm(
      `Email invoice #${invoice.invoice_number} for ${formatGBP(invoice.amount_pence)} to ${clientName} at ${clientEmail}?`
    );
    if (!ok) return;

    setSendingId(invoice.id);
    const result = await sendByEmail("invoice", invoice.id);
    setSendingId(null);

    if (result.sent) {
      alert(`Sent to ${result.to}.`);
    } else if (!result.configured) {
      alert(
        "Email hasn't been set up on this deployment, so nothing was sent. " +
          "Use Copy invoice link instead, or add RESEND_API_KEY and EMAIL_FROM."
      );
    } else {
      alert(result.error ?? "Could not send.");
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
          <div className="flex flex-wrap items-end gap-4">
            {basis === "time" ? (
              <>
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
              </>
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

            <div>
              <label className="label" htmlFor="due">
                Due
              </label>
              <input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="field mt-1 w-40"
              />
            </div>
          </div>

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
          {invoices.map((inv) => {
            const overdue = isOverdue(inv);
            const invItems = itemsFor(inv.id);
            const expanded = expandedId === inv.id;
            return (
              <li
                key={inv.id}
                className="card p-3.5 text-sm transition hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-base font-semibold">
                      {formatGBP(inv.amount_pence)}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        #{inv.invoice_number}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {inv.basis === "time" ? "Time-based" : "Fixed fee"} ·{" "}
                      {formatDate(inv.created_at)}
                      {inv.due_date && (
                        <span className={overdue ? "font-medium text-red-600" : ""}>
                          {" · "}
                          {overdue ? "overdue " : "due "}
                          {formatDate(inv.due_date)}
                        </span>
                      )}
                    </p>
                  </div>

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
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <button
                    onClick={() => setExpandedId(expanded ? null : inv.id)}
                    className="font-medium text-slate-500 hover:text-ink"
                    aria-expanded={expanded}
                  >
                    {expanded ? "Hide" : "Show"} {invItems.length} line
                    {invItems.length === 1 ? "" : "s"}
                  </button>

                  {inv.status === "draft" ? (
                    <span className="text-slate-400">
                      Mark as sent to get a link you can share.
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => copyLink(inv)}
                        className="font-medium text-teal hover:underline"
                      >
                        {copiedId === inv.id ? "✓ Link copied" : "Copy invoice link"}
                      </button>
                      {clientEmail ? (
                        <button
                          onClick={() => emailInvoice(inv)}
                          disabled={sendingId === inv.id}
                          className="font-medium text-teal hover:underline disabled:opacity-60"
                        >
                          {sendingId === inv.id ? "Sending…" : "Email it"}
                        </button>
                      ) : (
                        <span className="text-slate-400">
                          Add an email in Details to send it
                        </span>
                      )}
                    </>
                  )}
                </div>

                {expanded && (
                  <div className="animate-rise mt-3 border-t border-ink/10 pt-3">
                    <LineItems
                      items={invItems}
                      editable={inv.status === "draft"}
                      onRemove={removeItem}
                      onAdd={(d, q, p) => addItem(inv.id, d, q, p)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-slate-400">
          No invoices yet.
        </p>
      )}
    </div>
  );
}

function LineItems({
  items,
  editable,
  onRemove,
  onAdd,
}: {
  items: InvoiceItem[];
  editable: boolean;
  onRemove: (item: InvoiceItem) => void;
  onAdd: (description: string, quantityCenti: number, pricePence: number) => void;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const q = parseQuantity(quantity);
    const p = parsePricePence(price);
    if (!description.trim()) return setError("Give the line a description.");
    if (q === null) return setError("Quantity must be more than zero.");
    if (p === null) return setError("Enter a price of zero or more.");

    setError("");
    onAdd(description.trim(), q, p);
    setDescription("");
    setQuantity("1");
    setPrice("");
  }

  return (
    <div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{item.description}</span>
              <span className="shrink-0 font-mono text-slate-400">
                {formatQuantity(item.quantity_centi)} ×{" "}
                {formatGBP(item.unit_price_pence)}
              </span>
              <span className="w-20 shrink-0 text-right font-mono font-medium">
                {formatGBP(lineTotalPence(item))}
              </span>
              {editable && (
                <button
                  onClick={() => onRemove(item)}
                  aria-label={`Remove ${item.description}`}
                  className="shrink-0 text-slate-300 opacity-0 transition
                             hover:text-red-600 focus-visible:opacity-100
                             group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">No lines on this invoice.</p>
      )}

      {editable ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="label" htmlFor="li-desc">
              Description
            </label>
            <input
              id="li-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Extra revisions"
              className="field mt-1 text-xs"
            />
          </div>
          <div>
            <label className="label" htmlFor="li-qty">
              Qty
            </label>
            <input
              id="li-qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="field mt-1 w-16 text-xs"
            />
          </div>
          <div>
            <label className="label" htmlFor="li-price">
              £ each
            </label>
            <input
              id="li-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="150"
              className="field mt-1 w-20 text-xs"
            />
          </div>
          <button onClick={submit} className="btn-ghost text-xs">
            Add line
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          Lines can only be changed while an invoice is still a draft.
        </p>
      )}
    </div>
  );
}
