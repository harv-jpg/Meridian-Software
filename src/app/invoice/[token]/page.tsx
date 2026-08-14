"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatGBP } from "@/lib/format";

// Mirrors the return type of the get_invoice_by_token function. The client
// viewing this page has no account, so this is the only data they can reach —
// no ids, and nothing about the freelancer's other invoices.
interface InvoiceView {
  invoice_number: number;
  amount_pence: number;
  basis: string;
  status: string;
  due_date: string | null;
  created_at: string;
  client_name: string;
  issuer_email: string;
}

export default function InvoicePage() {
  const params = useParams();
  const token = params.token as string;

  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.rpc("get_invoice_by_token", {
          p_token: token,
        });
        if (error || !data || data.length === 0) {
          setError("This link isn't valid, or the invoice can't be found.");
        } else {
          setInvoice(data[0] as InvoiceView);
        }
      } catch {
        setError("Could not load this invoice. Check your connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

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

  return (
    <main className="flex min-h-screen justify-center px-6 py-12 md:py-16">
      <div className="w-full max-w-xl">
        <div className="card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-6">
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
          </div>

          <div className="p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">From</dt>
                <dd className="text-right font-medium">{invoice.issuer_email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">To</dt>
                <dd className="text-right font-medium">{invoice.client_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-right">{formatDate(invoice.created_at)}</dd>
              </div>
              {invoice.due_date && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Due</dt>
                  <dd
                    className={`text-right ${
                      overdue ? "font-medium text-red-600" : ""
                    }`}
                  >
                    {formatDate(invoice.due_date)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">For</dt>
                <dd className="text-right">
                  {invoice.basis === "time"
                    ? "Time worked"
                    : "Agreed fixed fee"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex items-baseline justify-between border-t border-ink/10 pt-5">
              <span className="label">Amount due</span>
              <span className="font-mono text-3xl font-semibold tracking-tight">
                {formatGBP(invoice.amount_pence)}
              </span>
            </div>

            {paid && (
              <p className="mt-5 rounded-md border border-teal/40 bg-teal/10 p-3 text-sm text-teal">
                ✓ This invoice has been paid. No action needed.
              </p>
            )}
          </div>
        </div>

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
