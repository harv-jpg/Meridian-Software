"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatGBP } from "@/lib/format";
import {
  formatQuantity,
  formatVatRate,
  grossPence,
  lineTotalPence,
  vatPence,
} from "@/lib/invoice";

// Mirrors the return type of get_invoice_by_token. The client viewing this
// page has no account, so this is the only data they can reach — no ids, and
// nothing about the freelancer's other invoices.
interface InvoiceView {
  invoice_number: number;
  amount_pence: number;
  vat_rate_bp: number;
  basis: string;
  status: string;
  due_date: string | null;
  created_at: string;
  client_name: string;
  client_address: string | null;
  issuer_email: string;
  business_name: string | null;
  business_address: string | null;
  vat_number: string | null;
  payment_details: string | null;
  invoice_footer: string | null;
}

// The function returns rows already ordered, so no position field is needed.
interface ItemView {
  description: string;
  quantity_centi: number;
  unit_price_pence: number;
}

export default function InvoicePage() {
  const params = useParams();
  const token = params.token as string;

  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [items, setItems] = useState<ItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      try {
        const [{ data, error }, { data: itemData }] = await Promise.all([
          supabase.rpc("get_invoice_by_token", { p_token: token }),
          supabase.rpc("get_invoice_items_by_token", { p_token: token }),
        ]);
        if (error || !data || data.length === 0) {
          setError("This link isn't valid, or the invoice can't be found.");
        } else {
          setInvoice(data[0] as InvoiceView);
          setItems((itemData ?? []) as ItemView[]);
        }
      } catch {
        setError("Could not load this invoice. Check your connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, supabase]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-slate-500">{error || "Invoice not found."}</p>
      </main>
    );
  }

  const paid = invoice.status === "paid";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !paid && invoice.due_date !== null && invoice.due_date < today;

  const net = invoice.amount_pence;
  const vat = vatPence(net, invoice.vat_rate_bp);
  const gross = grossPence(net, invoice.vat_rate_bp);
  const issuer = invoice.business_name ?? invoice.issuer_email;

  return (
    <main className="flex min-h-screen justify-center px-6 py-12 md:py-16">
      <div className="w-full max-w-2xl">
        <article className="card overflow-hidden print:border-0 print:shadow-none">
          <header className="flex items-start justify-between gap-4 border-b border-ink/10 p-6">
            <div>
              <p className="label">Invoice</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                #{invoice.invoice_number}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                paid
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : overdue
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-gold/40 bg-gold/10 text-gold"
              }`}
            >
              {paid ? "Paid" : overdue ? "Overdue" : "Due"}
            </span>
          </header>

          <div className="grid gap-6 border-b border-ink/10 p-6 sm:grid-cols-2">
            <section>
              <h2 className="label">From</h2>
              <p className="mt-1.5 font-medium">{issuer}</p>
              {invoice.business_address && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-500">
                  {invoice.business_address}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                {invoice.issuer_email}
              </p>
              {invoice.vat_number && (
                <p className="mt-1 text-sm text-slate-500">
                  VAT no. {invoice.vat_number}
                </p>
              )}
            </section>

            <section>
              <h2 className="label">To</h2>
              <p className="mt-1.5 font-medium">{invoice.client_name}</p>
              {invoice.client_address && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-500">
                  {invoice.client_address}
                </p>
              )}
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-slate-500">Issued</dt>
                  <dd>{formatDate(invoice.created_at)}</dd>
                </div>
                {invoice.due_date && (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Due</dt>
                    <dd className={overdue ? "font-medium text-red-600" : ""}>
                      {formatDate(invoice.due_date)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          <div className="p-6">
            {/* Itemised where lines exist; invoices raised before line items
                fall back to describing the basis. */}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left">
                      <th className="pb-2 font-medium text-slate-500">Description</th>
                      <th className="pb-2 text-right font-medium text-slate-500">Qty</th>
                      <th className="pb-2 text-right font-medium text-slate-500">Each</th>
                      <th className="pb-2 text-right font-medium text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-b border-ink/5">
                        <td className="py-2 pr-3">{item.description}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-500">
                          {formatQuantity(item.quantity_centi)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-500">
                          {formatGBP(item.unit_price_pence)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-medium">
                          {formatGBP(lineTotalPence(item))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                For:{" "}
                {invoice.basis === "time" ? "time worked" : "agreed fixed fee"}
              </p>
            )}

            <dl className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
              {invoice.vat_rate_bp > 0 && (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="font-mono tabular-nums">{formatGBP(net)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">
                      VAT at {formatVatRate(invoice.vat_rate_bp)}
                    </dt>
                    <dd className="font-mono tabular-nums">{formatGBP(vat)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between gap-4 border-t border-ink/10 pt-2">
                <dt className="label">Amount due</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums">
                  {formatGBP(gross)}
                </dd>
              </div>
            </dl>

            {paid ? (
              <p className="mt-6 rounded-md border border-teal/40 bg-teal/10 p-3 text-sm text-teal">
                ✓ This invoice has been paid. No action needed.
              </p>
            ) : (
              invoice.payment_details && (
                <section className="mt-6 rounded-md border border-ink/10 bg-[var(--paper-dim,#ECE7DC)] p-4">
                  <h2 className="label">How to pay</h2>
                  <p className="mt-2 whitespace-pre-line text-sm">
                    {invoice.payment_details}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Please quote <strong>#{invoice.invoice_number}</strong> as
                    the reference.
                  </p>
                </section>
              )
            )}

            {invoice.invoice_footer && (
              <p className="mt-6 whitespace-pre-line border-t border-ink/10 pt-4 text-xs text-slate-500">
                {invoice.invoice_footer}
              </p>
            )}
          </div>
        </article>

        {!paid && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Questions about this invoice? Reply to{" "}
            <a
              href={`mailto:${invoice.issuer_email}`}
              className="text-teal hover:underline"
            >
              {invoice.issuer_email}
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
