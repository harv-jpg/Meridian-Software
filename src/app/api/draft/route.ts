import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDuration, formatGBP } from "@/lib/format";
import { grossPence } from "@/lib/invoice";
import { daysSince, isOverdue, lastTouchedAt } from "@/lib/types";
import type { ClientRecord, Contract, Invoice, TimeEntry } from "@/lib/types";
import { STAGES } from "@/lib/stages";

// A draft is a short email. Anything longer than this is the model padding,
// not the user needing more room.
const MAX_TOKENS = 2000;

const DraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  /** One short line naming what the draft leans on, shown above the draft so
   *  the user can see why it says what it says before they send it. */
  angle: z.string(),
});

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

function toBullets(lines: (string | null | undefined)[]): string {
  return lines.filter(Boolean).map((l) => `- ${l}`).join("\n");
}

/**
 * Everything the model is allowed to know, assembled as plain text.
 *
 * Only the signed-in user's own rows reach this — every query below runs
 * through the Supabase server client, so row-level security decides what
 * comes back. Passing an id you do not own returns nothing, not someone
 * else's client.
 */
function buildRecord(opts: {
  client: ClientRecord;
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  contracts: Contract[];
  businessName: string | null;
  senderEmail: string | undefined;
}): string {
  const { client, invoices, timeEntries, contracts } = opts;
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
  const unpaid = invoices.filter(
    (i) => i.status === "sent" && !isOverdue(i)
  );
  const unsigned = contracts.filter((c) => c.status === "sent");

  return [
    `SENDER: ${opts.businessName ?? opts.senderEmail ?? "the consultant"}`,
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
      ? toBullets(unsigned.map((c) => `"${c.title}", sent ${formatDate(c.created_at)}`))
      : "- None.",
    "",
    "WORK DONE BUT NOT YET INVOICED",
    unbilledMinutes > 0
      ? toBullets([
          `${formatDuration(unbilledMinutes)} in total`,
          ...unbilledWork,
        ])
      : "- None.",
  ].join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 501, matching /api/send: nothing is broken, the feature simply has not
    // been set up. The UI hides the button rather than showing a failure.
    return NextResponse.json(
      {
        error:
          "Drafting is not configured. Set ANTHROPIC_API_KEY to enable it.",
      },
      { status: 501 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: { clientId?: string };
  try {
    payload = (await request.json()) as { clientId?: string };
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (!payload.clientId) {
    return NextResponse.json({ error: "No client given." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", payload.clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const [invoiceRes, timeRes, contractRes, profileRes] = await Promise.all([
    supabase.from("invoices").select("*").eq("client_id", client.id),
    supabase
      .from("time_entries")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase.from("contracts").select("*").eq("client_id", client.id),
    supabase
      .from("business_profiles")
      .select("business_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const record = buildRecord({
    client: client as ClientRecord,
    invoices: (invoiceRes.data ?? []) as Invoice[],
    timeEntries: (timeRes.data ?? []) as TimeEntry[],
    contracts: (contractRes.data ?? []) as Contract[],
    businessName: profileRes.data?.business_name ?? null,
    senderEmail: user.email,
  });

  const anthropic = new Anthropic({ apiKey });

  try {
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
          content: `Draft a follow-up email to this client.\n\n${record}`,
        },
      ],
    });

    const draft = response.parsed_output;
    if (!draft) {
      return NextResponse.json(
        { error: "The draft came back in a shape we could not read. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ draft });
  } catch (e) {
    // Typed errors rather than string matching, so a rate limit reads
    // differently from a bad key.
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "The Anthropic API key was rejected." },
        { status: 502 }
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Too many drafts at once. Wait a moment and try again." },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Drafting failed (${e.status}).` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Could not reach the drafting service." },
      { status: 502 }
    );
  }
}
