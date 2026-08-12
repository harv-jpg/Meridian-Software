"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry } from "@/lib/types";

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function TimeTab({
  clientId,
  userId,
}: {
  clientId: string;
  userId: string;
}) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setEntries((data ?? []) as TimeEntry[]);
    }
    load();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clientId]);

  function startTimer() {
    setRunning(true);
    setElapsedSec(0);
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (startRef.current) {
        setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
  }

  async function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);

    const minutes = Math.max(1, Math.round(elapsedSec / 60));

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

    if (!error && data) {
      setEntries((prev) => [data as TimeEntry, ...(prev ?? [])]);
    }

    setDescription("");
    setElapsedSec(0);
  }

  const totalMinutes = (entries ?? []).reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div>
      {!running ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you working on?"
            className="min-w-[160px] flex-1 rounded border border-ink/15 px-3 py-2 text-sm"
          />
          <button
            onClick={startTimer}
            className="rounded bg-teal px-4 py-2 text-sm font-medium text-ink"
          >
            Start
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded border border-ink/15 px-3 py-2">
          <span className="font-mono text-sm">
            {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
          </span>
          <button
            onClick={stopTimer}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper"
          >
            Stop &amp; save
          </button>
        </div>
      )}

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
        Logged {formatDuration(totalMinutes)} total
      </p>

      {entries !== null && entries.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex justify-between border-t border-ink/10 pt-1.5 text-sm">
              <span>{e.description || "No description"}</span>
              <span className="font-mono text-slate-500">{formatDuration(e.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
      {entries !== null && entries.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No time logged yet.</p>
      )}
    </div>
  );
}
