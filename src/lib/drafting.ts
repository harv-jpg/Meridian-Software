import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { formatDate, formatDuration, formatGBP } from "@/lib/format";
import { grossPence } from "@/lib/invoice";
import { daysSince, isOverdue, lastTouchedAt } from "@/lib/types";
import type { ClientRecord, Contract, Invoice, TimeEntry } from "@/lib/types";
import { STAGES } from "@/lib/stages";

/**
 * Writing a follow-up, shared by the two callers that need it: the button in
 * the client drawer, and the nightly job that parks drafts before you arrive.
 *
 * They must produce the same kind of email — a draft you asked for at 11am and
 * one written for you at 3am should not read differently — so the prompt and
 * the record format live here rather than in either caller.
 */

// A draft is a short email. Anything longer than this is the model padding,
// not the user needing more room.
const MAX_TOKENS = 2000;

export const DraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  /** One short line naming what the draft leans on, shown above the draft so
   *  the user can see why it says what it says before they send it. */
  angle: z.string(),
});

export type DraftOutput = z.infer<typeof DraftSchema>;

/** Why a draft is being written. Changes the closing instruction only. */
export type DraftReason = "silence" | "payment";

const SYSTEM = `You draft follow-up emails for a self-employed consultant writing to their own client.

You are given a factual record of the relationship. Write from it and nothing else.

Rules:
- Never invent a fact. No meetings, calls, dates, deliverables, prices or promises that are not in the record. If the record is thin, write a short email that says little rather than a long one that guesses.
- Plain British English. Short sentences. No marketing voice, no "I hope this email finds you well", no "circling back", no exclamation marks.
- Do not sign off with a name — the sender adds their own. End after the last sentence of the message.
- One clear ask, at the end. Usually a question they can answer in a line.
- Money: quote figures exactly as they appear in the record.
- Chasing an unpaid invoice is a factual reminder, not an apology and not a threat.
- 120 words or fewer.

The "angle" field is for the sender, not the client: one line, under 12 words, naming the fact the email is built on.`;

const ASK: Record<DraftReason, string> = {
  silence:
    "This deal has gone quiet. Ask whether they still want to go ahead, in a way that makes a one-line answer easy — including a no.",
  payment:
    "An invoice is past its due date. State which one and what is owed, and ask when it will be paid. Assume an oversight rather than a refusal.",
};

function toBullets(lines: (string | null | undefined)[]): string {
  return lines
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");
}

export interface ClientContext {
  client: ClientRecord;
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  contracts: Contract[];
  businessName: string | null;
  senderEmail: string | undefined;
}

/**
 * Everything the model is allowed to know about one client, as plain text.
 *
 * Nothing about any other client is assembled here, so a draft cannot mention
 * one client's work while writing to another. Whether the caller was entitled
 * to these rows is decided before this function is reached — by row-level
 * security for the drawer, and by an explicit user_id filter for the job.
 */
export function buildRecord(ctx: ClientContext): string {
  const { client, invoices, timeEntries, contracts } = ctx;
  const stage = STAGES.find((s) => s.key === client.stage)?.label ?? client.stage;
  const quietDays = daysSince(lastTouchedAt(client, invoices));

  const unbilledMinutes = timeEntries
    .filter((e) => e.invoice_id === null)
    .reduce((sum, e) => sum + e.minutes, 0);

  const unbilledWork = timeEntries
    .filter((e) => e.invoice_id === null && e.description)
    .slice(0, 8)
    .map((e) => `${e.description} (${formatDuration(e.minutes)})`);

  const overdue = invoices.filter(isOverdue);
  const unpaid = invoices.filter((i) => i.status === "sent" && !isOverdue(i));
  const unsigned = contracts.filter((c) => c.status === "sent");

  return [
    `SENDER: ${ctx.businessName ?? ctx.senderEmail ?? "the consultant"}`,
    "",
    "CLIENT",
    toBullets([
      `Name: ${client.name}`,
      client.company ? `Company: ${client.company}` : null,
      `Pipeline stage: ${stage}`,
      client.value_pence
        ? `Estimated value of the work: ${formatGBP(client.value_pence)}`
        : null,
      `Nothing has been recorded against this client for ${quietDays} day${quietDays === 1 ? "" : "s"}`,
      client.notes ? `The sender's private notes: ${client.notes}` : null,
    ]),
    "",
    "OVERDUE INVOICES",
    overdue.length
      ? toBullets(
          overdue.map(
            (i) =>
              `#${i.invoice_number} for ${formatGBP(grossPence(i.amount_pence, i.vat_rate_bp))}, was due ${formatDate(i.due_date)}`
          )
        )
      : "- None.",
    "",
    "SENT BUT NOT YET PAID (not late)",
    unpaid.length
      ? toBullets(
          unpaid.map(
            (i) =>
              `#${i.invoice_number} for ${formatGBP(grossPence(i.amount_pence, i.vat_rate_bp))}${i.due_date ? `, due ${formatDate(i.due_date)}` : ""}`
          )
        )
      : "- None.",
    "",
    "CONTRACTS SENT AND NOT SIGNED",
    unsigned.length
      ? toBullets(
          unsigned.map((c) => `"${c.title}", sent ${formatDate(c.created_at)}`)
        )
      : "- None.",
    "",
    "WORK DONE BUT NOT YET INVOICED",
    unbilledMinutes > 0
      ? toBullets([`${formatDuration(unbilledMinutes)} in total`, ...unbilledWork])
      : "- None.",
  ].join("\n");
}

/** Thrown when the model answered but not in a shape we can use. */
export class UnreadableDraftError extends Error {
  constructor() {
    super("The draft came back in a shape we could not read.");
    this.name = "UnreadableDraftError";
  }
}

/**
 * One model call. Callers own their own error handling — the route turns
 * these into status codes, the job logs and moves to the next client.
 */
export async function writeDraft(
  anthropic: Anthropic,
  ctx: ClientContext,
  reason: DraftReason
): Promise<DraftOutput> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      // A short email from a fixed record does not need deep reasoning; the
      // constraint that matters is not inventing facts, and that is prompt
      // work rather than thinking budget.
      effort: "low",
      format: zodOutputFormat(DraftSchema),
    },
    messages: [
      {
        role: "user",
        content: `Draft a follow-up email to this client.\n\n${ASK[reason]}\n\n${buildRecord(ctx)}`,
      },
    ],
  });

  if (!response.parsed_output) throw new UnreadableDraftError();
  return response.parsed_output;
}
