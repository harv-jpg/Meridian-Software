"use client";

import { useState } from "react";
import { draftFollowUp } from "@/lib/draft";
import type { Draft } from "@/lib/draft";
import { useFeedback } from "./feedback";

/**
 * Writes a follow-up email from what the app already knows about a client.
 *
 * Deliberately stops short of sending. The draft lands in an editable box; the
 * user copies it, or opens it in their own mail client with the send button
 * still unpressed. Nothing here can put an email in front of a client on its
 * own, and the model never sees anything beyond this one client's records.
 */
export default function FollowUpDraft({
  clientId,
  clientName,
  clientEmail,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [writing, setWriting] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { notify } = useFeedback();

  async function write() {
    setWriting(true);
    setCopied(false);
    const result = await draftFollowUp(clientId);
    setWriting(false);

    if (!result.configured) {
      // Not an error — this deployment has no key set. Say so once, in place,
      // rather than as a toast that vanishes.
      setUnavailable(
        result.error ??
          "Drafting is not set up on this deployment."
      );
      return;
    }
    if (!result.draft) {
      notify(result.error ?? "Could not write a draft.", "error");
      return;
    }

    setDraft(result.draft);
    setSubject(result.draft.subject);
    setBody(result.draft.body);
  }

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Could not reach the clipboard — select the text and copy it.", "error");
    }
  }

  const mailto = clientEmail
    ? `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  if (unavailable) {
    return (
      <div className="card mt-4 p-4">
        <p className="text-xs text-slate-500">{unavailable}</p>
      </div>
    );
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-plum" aria-hidden="true" />
          Draft a follow-up
        </h3>
        <span className="text-xs text-slate-400">Written from this record</span>
      </div>

      {draft === null ? (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Writes an email to {clientName} from their stage, notes, unbilled
            work and unpaid invoices. Nothing is sent — you get an editable
            draft.
          </p>
          <button
            onClick={write}
            disabled={writing}
            className="btn-primary mt-3"
            aria-busy={writing}
          >
            {writing ? "Writing…" : "Write a draft"}
          </button>
        </>
      ) : (
        <div className="animate-rise">
          <p className="mt-1.5 text-xs italic text-slate-500">{draft.angle}</p>

          <label className="label mt-3" htmlFor="draft-subject">
            Subject
          </label>
          <input
            id="draft-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="field mt-1"
          />

          <label className="label mt-3" htmlFor="draft-body">
            Message
          </label>
          <textarea
            id="draft-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="field mt-1 resize-y leading-relaxed"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={copy} className="btn-primary">
              {copied ? "✓ Copied" : "Copy"}
            </button>
            {mailto ? (
              <a href={mailto} className="btn-ghost">
                Open in email
              </a>
            ) : (
              <span className="text-xs text-slate-400">
                Add an email above to open it in your mail app
              </span>
            )}
            <button
              onClick={write}
              disabled={writing}
              className="ml-auto text-xs font-medium text-slate-400 transition hover:text-ink"
            >
              {writing ? "Writing…" : "Write another"}
            </button>
          </div>

          <p className="mt-3 border-t border-ink/10 pt-3 text-xs text-slate-400">
            Read it before you send it. It is written from your records, so
            check anything it claims still holds.
          </p>
        </div>
      )}
    </div>
  );
}
