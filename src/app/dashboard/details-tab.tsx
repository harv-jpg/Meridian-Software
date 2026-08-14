"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord } from "@/lib/types";

type Draft = {
  email: string;
  phone: string;
  company: string;
  notes: string;
};

function draftFrom(client: ClientRecord): Draft {
  return {
    email: client.email ?? "",
    phone: client.phone ?? "",
    company: client.company ?? "",
    notes: client.notes ?? "",
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

  const saved = draftFrom(client);
  const dirty =
    draft.email !== saved.email ||
    draft.phone !== saved.phone ||
    draft.company !== saved.company ||
    draft.notes !== saved.notes;

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
      notes: draft.notes,
    };

    const { error } = await supabase
      .from("clients")
      .update(fields)
      .eq("id", client.id);
    setSaving(false);

    if (error) {
      alert("Could not save — please try again.");
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
