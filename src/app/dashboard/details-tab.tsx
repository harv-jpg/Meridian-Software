"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord } from "@/lib/types";
import { isFollowUpDue, todayISO } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useFeedback } from "./feedback";
import FollowUpDraft from "./follow-up-draft";

type Draft = {
  email: string;
  phone: string;
  company: string;
  address: string;
  notes: string;
  follow_up_on: string;
};

/** Quick options, so the common case is one click rather than a date picker. */
const PRESETS: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
];

function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function draftFrom(client: ClientRecord): Draft {
  return {
    email: client.email ?? "",
    phone: client.phone ?? "",
    company: client.company ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
    follow_up_on: client.follow_up_on ?? "",
  };
}

export default function DetailsTab({
  client,
  onSaved,
  onDirtyChange,
}: {
  client: ClientRecord;
  onSaved: (fields: Partial<ClientRecord>) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(client));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const supabase = createClient();
  const { notify } = useFeedback();

  const saved = draftFrom(client);
  const dirty =
    draft.email !== saved.email ||
    draft.phone !== saved.phone ||
    draft.company !== saved.company ||
    draft.address !== saved.address ||
    draft.notes !== saved.notes ||
    draft.follow_up_on !== saved.follow_up_on;

  // The drawer needs to know about unsaved edits so it can warn before closing.
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2400);
    return () => clearTimeout(t);
  }, [justSaved]);

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    // Empty strings become null so the column stays genuinely empty rather
    // than holding "", which would defeat every `is null` check.
    const fields = {
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      company: draft.company.trim() || null,
      address: draft.address.trim() || null,
      notes: draft.notes,
      follow_up_on: draft.follow_up_on || null,
    };

    const { error } = await supabase
      .from("clients")
      .update(fields)
      .eq("id", client.id);
    setSaving(false);

    if (error) {
      notify("Could not save — please try again.", "error");
      return;
    }
    onSaved(fields);
    setJustSaved(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty && !saving) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="client-company">
              Company
            </label>
            <input
              id="client-company"
              value={draft.company}
              onChange={(e) => set("company", e.target.value)}
              className="field mt-1"
              placeholder="Marlowe Studio Ltd"
            />
          </div>
          <div>
            <label className="label" htmlFor="client-email">
              Email
            </label>
            <input
              id="client-email"
              type="email"
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
              className="field mt-1"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="client-phone">
              Phone
            </label>
            <input
              id="client-phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="field mt-1"
              placeholder="07700 900000"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="label" htmlFor="client-address">
            Address
          </label>
          <textarea
            id="client-address"
            value={draft.address}
            onChange={(e) => set("address", e.target.value)}
            rows={3}
            placeholder={"Their billing address — appears on invoices"}
            className="field mt-1 resize-y"
          />
        </div>

        {/* Saved values become actionable links — the point of holding a
            contact is being able to reach them in one tap. */}
        {(client.email || client.phone) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink/10 pt-3 text-sm">
            {client.email && (
              <a
                href={`mailto:${client.email}`}
                className="font-medium text-teal hover:underline"
              >
                ✉ Email
              </a>
            )}
            {client.phone && (
              <a
                href={`tel:${client.phone.replace(/\s/g, "")}`}
                className="font-medium text-teal hover:underline"
              >
                ✆ Call
              </a>
            )}
          </div>
        )}
      </div>

      {/* Overdue invoices answer "who owes me money". This answers "who
          haven't I chased", which is the half the board could not show. */}
      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="label" htmlFor="follow-up">
              Follow up on
            </label>
            <input
              id="follow-up"
              type="date"
              value={draft.follow_up_on}
              min={todayISO()}
              onChange={(e) => set("follow_up_on", e.target.value)}
              className="field mt-1 w-40"
            />
          </div>

          {draft.follow_up_on && (
            <button
              onClick={() => set("follow_up_on", "")}
              className="pb-2 text-xs font-medium text-slate-400 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set("follow_up_on", dateInDays(p.days))}
              className="rounded-full border border-ink/15 bg-white px-2.5 py-1
                         text-xs font-medium text-slate-600 transition
                         hover:border-teal/50 hover:bg-teal/5 hover:text-teal"
            >
              {p.label}
            </button>
          ))}
        </div>

        {client.follow_up_on && (
          <p
            className={`mt-3 border-t border-ink/10 pt-3 text-xs ${
              isFollowUpDue(client) ? "font-medium text-teal" : "text-slate-500"
            }`}
          >
            {isFollowUpDue(client) ? "Due now — " : "Scheduled for "}
            {formatDate(client.follow_up_on)}
          </p>
        )}
      </div>

      <FollowUpDraft
        clientId={client.id}
        clientName={client.name}
        clientEmail={client.email}
      />

      <label className="label mt-5" htmlFor="client-notes">
        Notes
      </label>
      <textarea
        id="client-notes"
        value={draft.notes}
        onChange={(e) => set("notes", e.target.value)}
        rows={9}
        className="field mt-1 resize-y leading-relaxed"
        placeholder="What was agreed, what they care about, what to chase next…"
      />

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>

        {justSaved && !dirty && (
          <span className="animate-fade-in text-sm font-medium text-teal">
            ✓ Saved
          </span>
        )}
        {dirty && !saving && (
          <span className="text-xs text-slate-400">Unsaved · ⌘↵ to save</span>
        )}
      </div>
    </div>
  );
}
