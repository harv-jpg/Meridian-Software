import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { secretsMatch } from "@/lib/crypto";
import type {
  ClientRecord,
  Contract,
  EmailMessage,
  Invoice,
  TimeEntry,
} from "@/lib/types";
import { writeDraft } from "@/lib/drafting";
import { groupByClient, selectCandidates } from "@/lib/nudges";

/**
 * The nightly job: find what needs chasing, write the email, park it.
 *
 * This is the only thing in the app that runs with nobody signed in, and the
 * only caller of the service-role client. It therefore does its own ownership
 * work — every read below is grouped by `user_id` and every row written
 * carries the id it came from. Nothing here crosses between accounts.
 *
 * It writes drafts. It does not send them. A parked nudge sits until its owner
 * reads it and presses send, which is what keeps "nothing sends without you"
 * true even though this runs at 3am.
 */

export const maxDuration = 300;

function unauthorised() {
  return NextResponse.json({ error: "Not authorised." }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!secret || !apiKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Same convention as the other optional features: not set up is a state,
    // not a failure. Returning 501 keeps a misconfigured deployment from
    // looking like a broken one in the cron logs.
    return NextResponse.json(
      {
        error:
          "Scheduled drafting is not configured. Needs CRON_SECRET, ANTHROPIC_API_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 501 }
    );
  }

  // Vercel Cron sends this header when CRON_SECRET is set on the project.
  // Without the check, the route is a public endpoint that spends money.
  if (!secretsMatch(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return unauthorised();
  }

  const supabase = createServiceClient();
  const anthropic = new Anthropic({ apiKey });

  const [clientRes, invoiceRes, waitingRes, emailRes, profileRes] = await Promise.all([
    supabase.from("clients").select("*").is("archived_at", null),
    // All of them, paid included. `isQuiet` treats a raised invoice as
    // activity, so filtering paid ones out here would make a client look
    // quieter to the job than they look on the board.
    supabase.from("invoices").select("*"),
    supabase.from("nudges").select("client_id, kind").eq("status", "waiting"),
    // Filed mail counts as activity: a client who replied last week is not
    // quiet, whatever their client row says.
    supabase.from("email_messages").select("client_id, sent_at"),
    supabase.from("business_profiles").select("user_id, business_name"),
  ]);

  const clients = (clientRes.data ?? []) as ClientRecord[];
  const invoices = (invoiceRes.data ?? []) as Invoice[];
  const waiting = new Set(
    (waitingRes.data ?? []).map((n) => `${n.client_id}:${n.kind}`)
  );
  const businessNames = new Map(
    (profileRes.data ?? []).map((p) => [p.user_id, p.business_name as string | null])
  );

  // Decide everything before calling the model, so the expensive part runs
  // over a list that is already capped.
  const invoicesByClient = groupByClient(invoices);
  const emailsByClient = groupByClient(
    (emailRes.data ?? []) as { client_id: string; sent_at: string }[]
  );
  const candidates = selectCandidates(
    clients,
    invoicesByClient,
    waiting,
    emailsByClient as Map<string, EmailMessage[]>
  );

  let written = 0;
  const failed: string[] = [];

  for (const { client, reason } of candidates) {
    try {
      const [timeRes, contractRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("client_id", client.id)
          .eq("user_id", client.user_id),
        supabase
          .from("contracts")
          .select("*")
          .eq("client_id", client.id)
          .eq("user_id", client.user_id),
      ]);

      const draft = await writeDraft(
        anthropic,
        {
          client,
          invoices: invoicesByClient.get(client.id) ?? [],
          timeEntries: (timeRes.data ?? []) as TimeEntry[],
          contracts: (contractRes.data ?? []) as Contract[],
          businessName: businessNames.get(client.user_id) ?? null,
          // The job has no session, so there is no signed-in address to fall
          // back on. Business details cover it when they are filled in.
          senderEmail: undefined,
        },
        reason
      );

      const { error } = await supabase.from("nudges").insert({
        user_id: client.user_id,
        client_id: client.id,
        kind: reason,
        subject: draft.subject,
        body: draft.body,
        angle: draft.angle,
      });

      if (error) failed.push(client.id);
      else written += 1;
    } catch {
      // One client failing must not abandon the rest of the run.
      failed.push(client.id);
    }
  }

  return NextResponse.json({
    considered: clients.length,
    drafted: written,
    failed: failed.length,
  });
}

// Vercel Cron issues GET. Kept separate so the handler above stays the one
// place the work is described.
export async function GET(request: Request) {
  return POST(request);
}
