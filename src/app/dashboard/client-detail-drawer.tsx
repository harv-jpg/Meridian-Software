"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  ClientRecord,
  Contract,
  Invoice,
  InvoiceItem,
  Stage,
  TimeEntry,
} from "@/lib/types";
import { STAGES } from "@/lib/stages";
import { formatDuration, formatGBP } from "@/lib/format";
import { grossPence } from "@/lib/invoice";
import DetailsTab from "./details-tab";
import TimeTab from "./time-tab";
import InvoicesTab from "./invoices-tab";
import ContractsTab from "./contracts-tab";

type Tab = "details" | "time" | "invoices" | "contracts";

export default function ClientDetailDrawer({
  client,
  userId,
  onClose,
  onClientSaved,
  onStageChange,
  onDeleted,
  defaultVatRateBp,
}: {
  client: ClientRecord;
  userId: string;
  onClose: () => void;
  onClientSaved: (fields: Partial<ClientRecord>) => void;
  onStageChange: (stage: Stage) => void;
  onDeleted: () => void;
  /** From your business details; applied to invoices raised here. */
  defaultVatRateBp: number;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  // Memoised so it is a stable dependency for the loading effect rather than
  // a new object on every render.
  const supabase = useMemo(() => createClient(), []);

  // Everything the drawer shows is fetched once, here, rather than each tab
  // fetching on mount. Switching tabs used to mean a fresh round-trip and a
  // flash of empty state, and the Invoices tab could show an unbilled total
  // that the Time tab had already made stale.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [timeRes, invoiceRes, contractRes] = await Promise.all([
          supabase
            .from("time_entries")
            .select("*")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("invoices")
            .select("*")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("contracts")
            .select("*")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false }),
        ]);

        if (cancelled) return;
        const loadedInvoices = (invoiceRes.data ?? []) as Invoice[];
        setTimeEntries((timeRes.data ?? []) as TimeEntry[]);
        setInvoices(loadedInvoices);
        setContracts((contractRes.data ?? []) as Contract[]);

        // Line items need the invoice ids, so this one cannot join the
        // parallel batch above. Skipped entirely when there are no invoices.
        if (loadedInvoices.length > 0) {
          const { data: itemData } = await supabase
            .from("invoice_items")
            .select("*")
            .in("invoice_id", loadedInvoices.map((i) => i.id))
            .order("position", { ascending: true });
          if (cancelled) return;
          setInvoiceItems((itemData ?? []) as InvoiceItem[]);
        } else {
          setInvoiceItems([]);
        }
      } catch {
        // A rejected request (offline, DNS failure) would otherwise leave the
        // panel showing its loading skeleton indefinitely.
        if (cancelled) return;
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [client.id, supabase]);

  const requestClose = useCallback(() => {
    // The old modal closed on any backdrop click, which quietly discarded an
    // unsaved note. Ask instead.
    if (notesDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Close anyway and lose them?"
      );
      if (!ok) return;
    }
    onClose();
  }, [notesDirty, onClose]);

  // Escape to close, and lock the page behind the drawer so the board does
  // not scroll under it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  async function changeStage(stage: Stage) {
    if (stage === client.stage || savingStage) return;
    setSavingStage(true);
    const previous = client.stage;
    onStageChange(stage);

    const { error } = await supabase
      .from("clients")
      .update({ stage })
      .eq("id", client.id);

    setSavingStage(false);
    if (error) {
      onStageChange(previous);
      alert("Could not change the stage — please try again.");
    }
  }

  // Archiving is the ordinary way to finish with a client. Permanent deletion
  // stays available only while there is nothing of record value to destroy —
  // once time, an invoice or a contract exists, the cascade would take records
  // you are expected to keep, and the button disappears.
  const hasRecords =
    timeEntries.length > 0 || invoices.length > 0 || contracts.length > 0;

  async function deletePermanently() {
    const ok = window.confirm(
      `Delete ${client.name} permanently? There is nothing billed against them, ` +
        "so nothing else is lost. This cannot be undone."
    );
    if (!ok) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      alert("Could not delete — please try again.");
      return;
    }
    onDeleted();
  }

  const totals = useMemo(() => {
    const trackedMinutes = timeEntries.reduce((sum, e) => sum + e.minutes, 0);
    const unbilledMinutes = timeEntries
      .filter((e) => e.invoice_id === null)
      .reduce((sum, e) => sum + e.minutes, 0);
    // Totals are gross, matching what the client is actually asked to pay.
    const invoicedPence = invoices.reduce(
      (sum, i) => sum + grossPence(i.amount_pence, i.vat_rate_bp),
      0
    );
    const paidPence = invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + grossPence(i.amount_pence, i.vat_rate_bp), 0);
    return { trackedMinutes, unbilledMinutes, invoicedPence, paidPence };
  }, [timeEntries, invoices]);

  const tabs: { key: Tab; label: string; count: number | null }[] = [
    { key: "details", label: "Details", count: null },
    { key: "time", label: "Time", count: timeEntries.length },
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "contracts", label: "Contracts", count: contracts.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]"
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-client-name"
        tabIndex={-1}
        className="scroll-slim relative flex h-full w-full max-w-xl animate-slide-in
                   flex-col overflow-y-auto bg-paper shadow-drawer outline-none"
      >
        {/* Header stays put while the body scrolls, so the client you are
            looking at is always named on screen. */}
        <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/95 backdrop-blur">
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="min-w-0">
              <h2
                id="drawer-client-name"
                className="truncate text-2xl font-semibold tracking-tight"
              >
                {client.name}
              </h2>
              <p className="mt-1 font-mono text-sm text-slate-500">
                {formatGBP(client.value_pence)}
                <span className="ml-2 font-sans text-slate-400">
                  estimated value
                </span>
              </p>
            </div>
            <button
              onClick={requestClose}
              aria-label="Close panel"
              className="shrink-0 rounded-md p-2 text-slate-400 transition
                         hover:bg-ink/5 hover:text-ink"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </div>

          {/* Stage is changed from here now. Previously the only way was to
              close the panel and drag the card to another column. */}
          <div className="flex flex-wrap gap-1.5 px-6 pt-4">
            {STAGES.map((s) => {
              const active = client.stage === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => changeStage(s.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition
                              active:scale-[0.97] ${active ? s.chipActive : s.chip}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <nav className="mt-4 flex gap-1 px-6" aria-label="Client sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition ${
                  tab === t.key
                    ? "text-ink"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {t.label}
                {t.count !== null && t.count > 0 && (
                  <span className="rounded-full bg-ink/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    {t.count}
                  </span>
                )}
                {tab === t.key && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" />
                )}
              </button>
            ))}
          </nav>
        </header>

        {/* At-a-glance figures, so the state of the relationship is legible
            without clicking through all four tabs. */}
        <div className="grid grid-cols-4 gap-px border-b border-ink/10 bg-ink/10">
          <SummaryCell
            label="Tracked"
            value={formatDuration(totals.trackedMinutes)}
            loading={loading}
          />
          <SummaryCell
            label="Unbilled"
            value={formatDuration(totals.unbilledMinutes)}
            loading={loading}
            highlight={totals.unbilledMinutes > 0}
          />
          <SummaryCell
            label="Invoiced"
            value={formatGBP(totals.invoicedPence)}
            loading={loading}
          />
          <SummaryCell
            label="Paid"
            value={formatGBP(totals.paidPence)}
            loading={loading}
          />
        </div>

        <div className="flex-1 px-6 py-5">
          {loading ? (
            <Skeleton />
          ) : loadError ? (
            <p className="rounded-lg border border-dashed border-red-200 bg-red-50/50 px-4 py-6 text-center text-sm text-red-700">
              Could not load this client&rsquo;s history. Check your connection
              and reopen the panel.
            </p>
          ) : (
            <div key={tab} className="animate-rise">
              {tab === "details" && (
                <DetailsTab
                  client={client}
                  onSaved={onClientSaved}
                  onDirtyChange={setNotesDirty}
                />
              )}
              {tab === "time" && (
                <TimeTab
                  clientId={client.id}
                  userId={userId}
                  entries={timeEntries}
                  setEntries={setTimeEntries}
                />
              )}
              {tab === "invoices" && (
                <InvoicesTab
                  clientId={client.id}
                  userId={userId}
                  invoices={invoices}
                  setInvoices={setInvoices}
                  timeEntries={timeEntries}
                  setTimeEntries={setTimeEntries}
                  items={invoiceItems}
                  setItems={setInvoiceItems}
                  clientEmail={client.email}
                  clientName={client.name}
                  defaultVatRateBp={defaultVatRateBp}
                  defaultFixedFeePence={client.value_pence}
                />
              )}
              {tab === "contracts" && (
                <ContractsTab
                  clientId={client.id}
                  userId={userId}
                  contracts={contracts}
                  setContracts={setContracts}
                  clientEmail={client.email}
                  clientName={client.name}
                />
              )}
            </div>
          )}
        </div>

        {!loading && !loadError && (
          <footer className="border-t border-ink/10 px-6 py-4">
            {hasRecords ? (
              <p className="text-xs text-slate-400">
                This client has billed work against them, so they can only be
                archived — deleting would take their time, invoices and
                contracts with them.
              </p>
            ) : (
              <button
                onClick={deletePermanently}
                className="text-xs font-medium text-slate-400 transition hover:text-red-600"
              >
                Delete permanently
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  loading,
  highlight = false,
}: {
  label: string;
  value: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="bg-paper px-3 py-3 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {loading ? (
        <div className="mx-auto mt-1.5 h-4 w-12 rounded bg-ink/10" />
      ) : (
        <div
          className={`mt-1 font-mono text-sm font-semibold ${
            highlight ? "text-teal" : "text-ink"
          }`}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-9 w-full rounded-md bg-ink/5" />
      <div className="h-9 w-4/5 rounded-md bg-ink/5" />
      <div className="h-9 w-2/3 rounded-md bg-ink/5" />
    </div>
  );
}
