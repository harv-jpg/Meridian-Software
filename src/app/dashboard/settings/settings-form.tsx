"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatVatRate, parseVatRate } from "@/lib/invoice";
import type { BusinessProfile } from "@/lib/types";

export default function SettingsForm({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: BusinessProfile | null;
}) {
  const [businessName, setBusinessName] = useState(
    initialProfile?.business_name ?? ""
  );
  const [address, setAddress] = useState(initialProfile?.address ?? "");
  const [vatNumber, setVatNumber] = useState(initialProfile?.vat_number ?? "");
  const [vatRate, setVatRate] = useState(
    initialProfile ? String(initialProfile.default_vat_rate_bp / 100) : "0"
  );
  const [paymentDetails, setPaymentDetails] = useState(
    initialProfile?.payment_details ?? ""
  );
  const [invoiceFooter, setInvoiceFooter] = useState(
    initialProfile?.invoice_footer ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  async function save() {
    const rate = parseVatRate(vatRate || "0");
    if (rate === null) {
      setError("VAT rate must be zero or more.");
      return;
    }

    setSaving(true);
    setError("");

    // Upsert rather than insert-or-update: there is one row per user keyed by
    // user_id, so this is the same call whether or not it exists yet.
    const { error: saveError } = await supabase
      .from("business_profiles")
      .upsert(
        {
          user_id: userId,
          business_name: businessName.trim() || null,
          address: address.trim() || null,
          vat_number: vatNumber.trim() || null,
          payment_details: paymentDetails.trim() || null,
          invoice_footer: invoiceFooter.trim() || null,
          default_vat_rate_bp: rate,
        },
        { onConflict: "user_id" }
      );

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="font-semibold">Who the invoice is from</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="biz-name">
              Business name
            </label>
            <input
              id="biz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your name, or your limited company"
              className="field mt-1"
            />
          </div>
          <div>
            <label className="label" htmlFor="biz-address">
              Address
            </label>
            <textarea
              id="biz-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder={"12 Example Street\nHereford\nHR1 2AB"}
              className="field mt-1 resize-y"
            />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">VAT</h2>
        <p className="mt-1 text-sm text-slate-500">
          Leave the rate at 0 if you are not registered. Once you are, both the
          number and the rate have to appear on every invoice.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex-1">
            <label className="label" htmlFor="vat-number">
              VAT number
            </label>
            <input
              id="vat-number"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="GB123456789"
              className="field mt-1"
            />
          </div>
          <div>
            <label className="label" htmlFor="vat-rate">
              Default rate (%)
            </label>
            <input
              id="vat-rate"
              type="number"
              min="0"
              step="0.5"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className="field mt-1 w-28"
            />
            <p className="mt-1 text-xs text-slate-400">
              {formatVatRate(parseVatRate(vatRate || "0") ?? 0)} on new invoices
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">How to pay you</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shown on the invoice your client opens. Without it they have an amount
          and no way to settle it.
        </p>
        <textarea
          value={paymentDetails}
          onChange={(e) => setPaymentDetails(e.target.value)}
          rows={4}
          placeholder={
            "Bank transfer\nAccount name: A Freelancer\nSort code: 00-00-00\nAccount number: 12345678"
          }
          className="field mt-4 resize-y"
          aria-label="Payment details"
        />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Invoice footer</h2>
        <p className="mt-1 text-sm text-slate-500">
          Anything that has to appear at the bottom — payment terms, company
          number, late-payment policy.
        </p>
        <textarea
          value={invoiceFooter}
          onChange={(e) => setInvoiceFooter(e.target.value)}
          rows={3}
          placeholder="Payment due within 30 days. Late payments may incur interest under the Late Payment of Commercial Debts (Interest) Act 1998."
          className="field mt-4 resize-y"
          aria-label="Invoice footer"
        />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save details"}
        </button>
        {saved && (
          <span className="animate-fade-in text-sm font-medium text-teal">
            ✓ Saved
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
