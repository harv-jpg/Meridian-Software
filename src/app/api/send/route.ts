import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatGBP } from "@/lib/format";
import { grossPence } from "@/lib/invoice";

// Sending goes through Resend's REST API with plain fetch rather than their
// SDK — one less dependency for one HTTP call. Swapping provider means
// changing `deliver` below and nothing else.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendRequest {
  kind: "invoice" | "contract";
  id: string;
}

function configuration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return { apiKey, from, configured: Boolean(apiKey && from) };
}

async function deliver(opts: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
}) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Email provider rejected the send: ${res.status} ${detail}`);
  }
}

function shell(body: string, footer: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      font-size:15px;line-height:1.55;color:#10192E;max-width:520px;margin:0 auto;padding:24px">
      ${body}
      <p style="margin-top:32px;font-size:12px;color:#8593AB">${footer}</p>
    </div>`;
}

function button(href: string, label: string) {
  return `<p style="margin:28px 0">
      <a href="${href}" style="background:#10192E;color:#F6F4EF;text-decoration:none;
        padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${label}</a>
    </p>
    <p style="font-size:12px;color:#8593AB;word-break:break-all">
      Or paste this into your browser: ${href}
    </p>`;
}

export async function POST(request: Request) {
  const { apiKey, from, configured } = configuration();
  if (!configured) {
    // 501 rather than 500: nothing is broken, the feature simply has not been
    // set up. The UI uses this to fall back to copy-a-link.
    return NextResponse.json(
      {
        error:
          "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM to enable sending.",
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

  let body: SendRequest;
  try {
    body = (await request.json()) as SendRequest;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (body.kind !== "invoice" && body.kind !== "contract") {
    return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  // Every read below runs as the signed-in user, so row-level security is
  // what enforces ownership — this route cannot be used to email someone
  // else's invoice by guessing an id.
  if (body.kind === "invoice") {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*, clients(name, email)")
      .eq("id", body.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Mark the invoice as sent before emailing it." },
        { status: 400 }
      );
    }

    const client = invoice.clients as { name: string; email: string | null };
    if (!client?.email) {
      return NextResponse.json(
        { error: "This client has no email address saved." },
        { status: 400 }
      );
    }

    const link = `${origin}/invoice/${invoice.share_token}`;
    const due = invoice.due_date
      ? `<p>Payment is due by <strong>${formatDate(invoice.due_date)}</strong>.</p>`
      : "";

    try {
      await deliver({
        apiKey: apiKey!,
        from: from!,
        to: client.email,
        replyTo: user.email,
        subject: `Invoice #${invoice.invoice_number} — ${formatGBP(grossPence(invoice.amount_pence, invoice.vat_rate_bp))}`,
        html: shell(
          `<p>Hello ${client.name},</p>
           <p>Here is invoice <strong>#${invoice.invoice_number}</strong> for
           <strong>${formatGBP(grossPence(invoice.amount_pence, invoice.vat_rate_bp))}</strong>.</p>
           ${due}
           ${button(link, "View invoice")}`,
          `Sent by ${user.email}. Reply to this email with any questions.`
        ),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not send." },
        { status: 502 }
      );
    }

    return NextResponse.json({ sent: true, to: client.email });
  }

  const { data: contract } = await supabase
    .from("contracts")
    .select("*, clients(name, email)")
    .eq("id", body.id)
    .single();

  if (!contract) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }
  if (contract.status === "draft") {
    return NextResponse.json(
      { error: "Mark the contract as sent before emailing it." },
      { status: 400 }
    );
  }

  const client = contract.clients as { name: string; email: string | null };
  if (!client?.email) {
    return NextResponse.json(
      { error: "This client has no email address saved." },
      { status: 400 }
    );
  }

  const link = `${origin}/sign/${contract.sign_token}`;

  try {
    await deliver({
      apiKey: apiKey!,
      from: from!,
      to: client.email,
      replyTo: user.email,
      subject: `Please sign: ${contract.title}`,
      html: shell(
        `<p>Hello ${client.name},</p>
         <p>Please review and sign <strong>${contract.title}</strong>.</p>
         ${button(link, "Review and sign")}`,
        `Sent by ${user.email}. Reply to this email with any questions.`
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send." },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true, to: client.email });
}
