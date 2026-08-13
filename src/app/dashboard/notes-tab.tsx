"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord } from "@/lib/types";

export default function NotesTab({
  client,
  onSaved,
  onDirtyChange,
}: {
  client: ClientRecord;
  onSaved: (notes: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const supabase = createClient();

  const dirty = draft !== (client.notes ?? "");

  // The drawer needs to know about unsaved text so it can warn before closing.
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  // Clear the confirmation once the text changes again.
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2400);
    return () => clearTimeout(t);
  }, [justSaved]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ notes: draft })
      .eq("id", client.id);
    setSaving(false);

    if (error) {
      alert("Could not save notes — please try again.");
      return;
    }
    onSaved(draft);
    setJustSaved(true);
  }

  // Cmd/Ctrl+Enter saves, so you can write and file without reaching for the
  // mouse.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty && !saving) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={12}
        className="field resize-y leading-relaxed"
        placeholder="What was agreed, what they care about, what to chase next…"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary"
        >
          {saving ? "Saving…" : "Save notes"}
        </button>

        {justSaved && !dirty && (
          <span className="animate-fade-in text-sm font-medium text-teal">
            ✓ Saved
          </span>
        )}
        {dirty && !saving && (
          <span className="text-xs text-slate-400">
            Unsaved · ⌘↵ to save
          </span>
        )}
      </div>
    </div>
  );
}
