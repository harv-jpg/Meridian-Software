"use client";

import type { EmailMessage } from "@/lib/types";
import { formatDate } from "@/lib/format";

/**
 * Mail with this client, filed by the sync rather than typed by anyone.
 *
 * Headers and Gmail's own one-line preview only. This is a record of what
 * happened and when, not a mail client — reading the whole thread is what the
 * mail app is for, and the subject links straight to it.
 */
export default function EmailsTab({
  messages,
  hasInbox,
  clientEmail,
}: {
  messages: EmailMessage[];
  /** False when no mailbox is connected, which is a different empty state. */
  hasInbox: boolean;
  clientEmail: string | null;
}) {
  if (!hasInbox) {
    return (
      <div className="rounded-lg border border-dashed border-ink/15 px-4 py-8 text-center">
        <p className="text-sm text-slate-500">No inbox connected.</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
          Connect Gmail in Business details and mail with this client is filed
          here automatically.
        </p>
      </div>
    );
  }

  if (!clientEmail) {
    return (
      <p className="rounded-lg border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-slate-400">
        Add an email address in Details and their mail will be filed here.
      </p>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-slate-400">
        Nothing filed yet for {clientEmail}.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className="card p-3.5 text-sm transition hover:shadow-lift">
          <div className="flex items-start justify-between gap-3">
            <a
              href={`https://mail.google.com/mail/u/0/#all/${m.thread_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 font-medium hover:underline"
            >
              {m.subject || "(no subject)"}
            </a>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                m.direction === "in"
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-ink/15 bg-ink/5 text-slate-500"
              }`}
            >
              {m.direction === "in" ? "Received" : "Sent"}
            </span>
          </div>

          {m.snippet && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
              {m.snippet}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="truncate">
              {m.direction === "in" ? m.from_address : `to ${m.to_address}`}
            </span>
            <span className="ml-auto shrink-0">{formatDate(m.sent_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
