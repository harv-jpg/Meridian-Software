import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isOverdue } from "@/lib/types";
import type { ClientRecord, Contract, Invoice, TimeEntry } from "@/lib/types";
import { UnreadableDraftError, writeDraft } from "@/lib/drafting";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 501, matching /api/send: nothing is broken, the feature simply has not
    // been set up. The UI hides the button rather than showing a failure.
    return NextResponse.json(
      {
        error: "Drafting is not configured. Set ANTHROPIC_API_KEY to enable it.",
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

  // Every read below runs as the signed-in user, so row-level security is what
  // enforces ownership — passing an id you do not own returns nothing rather
  // than someone else's client.
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

  const invoices = (invoiceRes.data ?? []) as Invoice[];

  try {
    const draft = await writeDraft(
      new Anthropic({ apiKey }),
      {
        client: client as ClientRecord,
        invoices,
        timeEntries: (timeRes.data ?? []) as TimeEntry[],
        contracts: (contractRes.data ?? []) as Contract[],
        businessName: profileRes.data?.business_name ?? null,
        senderEmail: user.email,
      },
      // Money outranks silence: if something is genuinely late, that is what
      // the email should be about.
      invoices.some(isOverdue) ? "payment" : "silence"
    );

    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof UnreadableDraftError) {
      return NextResponse.json({ error: `${e.message} Try again.` }, { status: 502 });
    }
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
