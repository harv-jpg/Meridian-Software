"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord } from "@/lib/types";

export default function NotesTab({
  client,
  onSaved,
}: {
  client: ClientRecord;
  onSaved: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

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
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        className="w-full rounded border border-ink/15 px-3 py-2 text-sm"
        placeholder="Notes on this client…"
      />
      <button
        onClick={save}
        disabled={saving}
        className="mt-3 rounded bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save notes"}
      </button>
    </div>
  );
}
