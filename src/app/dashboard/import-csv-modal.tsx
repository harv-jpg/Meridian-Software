"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, Stage } from "@/lib/types";

type FieldKey = "name" | "email" | "phone" | "company" | "value" | "stage" | "notes";

const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "name", label: "Client name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "company", label: "Company", required: false },
  { key: "value", label: "Deal value", required: false },
  { key: "stage", label: "Status / stage", required: false },
  { key: "notes", label: "Notes", required: false },
];

function guessColumn(headers: string[], keywords: string[]) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

function parseValueToPence(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100);
}

function guessStage(raw: string | undefined): Stage {
  if (!raw) return "lead";
  const v = raw.toLowerCase();
  if (v.includes("won") || v.includes("active") || v.includes("client")) return "won";
  if (v.includes("lost") || v.includes("declined")) return "lost";
  if (v.includes("negotiat")) return "negotiating";
  if (v.includes("proposal") || v.includes("quote") || v.includes("sent")) return "proposal_sent";
  return "lead";
}

export default function ImportCsvModal({
  userId,
  onClose,
  onImported,
}: {
  userId: string;
  onClose: () => void;
  onImported: (clients: ClientRecord[]) => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    value: "",
    stage: "",
    notes: "",
  });
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  function handleFile(file: File) {
    setError("");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        setHeaders(fields);
        setRows(results.data);
        setMapping({
          name: guessColumn(fields, ["name", "client", "contact"]),
          email: guessColumn(fields, ["email", "e-mail", "mail"]),
          phone: guessColumn(fields, ["phone", "mobile", "tel", "number"]),
          company: guessColumn(fields, ["company", "business", "organisation", "organization"]),
          value: guessColumn(fields, ["value", "amount", "price", "fee"]),
          stage: guessColumn(fields, ["stage", "status"]),
          notes: guessColumn(fields, ["note", "comment", "description"]),
        });
      },
      error: () => setError("Could not read that file — make sure it's a valid CSV."),
    });
  }

  async function handleImport() {
    if (!mapping.name) {
      setError("Pick which column is the client name — that's required.");
      return;
    }
    setImporting(true);
    setError("");

    const toInsert = rows
      .map((row) => ({
        user_id: userId,
        name: (row[mapping.name] || "").trim(),
        email: mapping.email ? row[mapping.email]?.trim() || null : null,
        phone: mapping.phone ? row[mapping.phone]?.trim() || null : null,
        company: mapping.company ? row[mapping.company]?.trim() || null : null,
        value_pence: mapping.value ? parseValueToPence(row[mapping.value]) : null,
        stage: mapping.stage ? guessStage(row[mapping.stage]) : "lead",
        notes: mapping.notes ? row[mapping.notes] || null : null,
      }))
      .filter((r) => r.name.length > 0);

    if (toInsert.length === 0) {
      setImporting(false);
      setError("No valid rows found — check your column mapping.");
      return;
    }

    const { data, error } = await supabase.from("clients").insert(toInsert).select();

    setImporting(false);

    if (error || !data) {
      setError(error?.message ?? "Import failed — please try again.");
      return;
    }

    onImported(data as ClientRecord[]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Import from CSV</h2>
          <button onClick={onClose} className="rounded border border-ink/15 px-2 py-1 text-sm text-slate-500">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Export your contacts as a CSV from your current CRM (Dubsado, HoneyBook,
          a spreadsheet, anything) and drop it here.
        </p>

        {headers.length === 0 ? (
          <div className="mt-6">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="block w-full rounded border border-dashed border-ink/25 p-6 text-sm"
            />
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <label className="w-32 text-sm text-slate-600">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </label>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    className="flex-1 rounded border border-ink/15 px-2 py-1.5 text-sm"
                  >
                    <option value="">— don&rsquo;t import —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Found {rows.length} row{rows.length === 1 ? "" : "s"} in this file.
            </p>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <button
              onClick={handleImport}
              disabled={importing}
              className="mt-4 rounded bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
            >
              {importing ? "Importing…" : `Import ${rows.length} client${rows.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}

        {error && headers.length === 0 && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
