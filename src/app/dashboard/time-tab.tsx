"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/format";
import { useFeedback } from "./feedback";

function clockFace(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimeTab({
  clientId,
  userId,
  entries,
  setEntries,
}: {
  clientId: string;
  userId: string;
  entries: TimeEntry[];
  setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
}) {
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [manualMinutes, setManualMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabase = createClient();
  const { notify } = useFeedback();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startTimer() {
    setRunning(true);
    setElapsedSec(0);
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (startRef.current) {
        // Derived from wall-clock rather than a tick counter, so the total
        // stays correct if the tab is backgrounded and timers are throttled.
        setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
  }

  function cancelTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setElapsedSec(0);
    startRef.current = null;
  }

  async function saveEntry(minutes: number) {
    setSaving(true);
    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        client_id: clientId,
        user_id: userId,
        description: description.trim() || null,
        minutes,
      })
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      notify("Could not save that time entry — please try again.", "error");
      return;
    }

    setEntries((prev) => [data as TimeEntry, ...prev]);
    setDescription("");
  }

  async function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    const minutes = Math.max(1, Math.round(elapsedSec / 60));
    setElapsedSec(0);
    startRef.current = null;
    await saveEntry(minutes);
  }

  async function addManual() {
    const minutes = Math.round(parseFloat(manualMinutes || "0"));
    if (!minutes || minutes <= 0) return;
    setManualMinutes("");
    await saveEntry(minutes);
  }

  async function deleteEntry(id: string) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      setEntries(previous);
      notify("Could not delete that entry — please try again.", "error");
    }
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div>
      {running ? (
        <div className="card flex items-center justify-between gap-3 border-teal/40 bg-teal/5 p-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
            </span>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {clockFace(elapsedSec)}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={cancelTimer} className="btn-ghost">
              Discard
            </button>
            <button onClick={stopTimer} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Stop & save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-4">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you working on?"
            className="field"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={startTimer} className="btn-primary">
              <span className="text-xs">▶</span> Start timer
            </button>
            <span className="text-xs text-slate-400">or log</span>
            <input
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManual()}
              type="number"
              min="1"
              placeholder="45"
              className="field w-20"
            />
            <span className="text-xs text-slate-400">min</span>
            <button
              onClick={addManual}
              disabled={saving || !manualMinutes}
              className="btn-ghost"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-baseline justify-between">
        <h3 className="label">Logged</h3>
        <span className="font-mono text-sm font-semibold">
          {formatDuration(totalMinutes)}
        </span>
      </div>

      {entries.length > 0 ? (
        <ul className="mt-2 divide-y divide-ink/10">
          {entries.map((e) => (
            <li
              key={e.id}
              className="group flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {e.description || (
                    <span className="text-slate-400">No description</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDate(e.created_at)}
                  {e.invoice_id && (
                    <span className="ml-2 rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-teal">
                      billed
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-slate-600">
                  {formatDuration(e.minutes)}
                </span>
                <button
                  onClick={() => deleteEntry(e.id)}
                  aria-label="Delete entry"
                  className="text-slate-300 opacity-0 transition group-hover:opacity-100
                             hover:text-red-600 focus-visible:opacity-100"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text="No time logged yet. Start the timer above, or add minutes by hand." />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </p>
  );
}
