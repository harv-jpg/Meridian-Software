import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, hasCredentialKey } from "@/lib/crypto";
import { ImapAuthError, verifyCredentials } from "@/lib/imap";
import { findProvider, providerColumn } from "@/lib/providers";

/**
 * Connects a mailbox with an app password.
 *
 * The credential is proved against the real server before anything is stored,
 * so a typo fails here with a message rather than becoming a connection that
 * quietly never syncs. It is encrypted on the way in — see lib/crypto.ts for
 * why that is worth doing on top of the row-level security.
 */
export async function POST(request: Request) {
  if (!hasCredentialKey() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Mailbox connections are not configured on this deployment. Needs CREDENTIAL_KEY and SUPABASE_SERVICE_ROLE_KEY.",
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

  let body: {
    providerId?: string;
    email?: string;
    password?: string;
    host?: string;
    port?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const provider = findProvider(body.providerId ?? "");
  const email = body.email?.trim();
  const password = body.password;

  if (!provider || !email || !password) {
    return NextResponse.json(
      { error: "Pick a provider and fill in both fields." },
      { status: 400 }
    );
  }
  if (provider.method !== "password") {
    return NextResponse.json(
      { error: `${provider.label} connects by signing in, not with a password.` },
      { status: 400 }
    );
  }

  // "Something else" supplies its own host; the named providers do not get to
  // have theirs overridden by the request body.
  const host = provider.id === "custom" ? body.host?.trim() : provider.host;
  const port = provider.id === "custom" ? Number(body.port) || 993 : provider.port;

  if (!host) {
    return NextResponse.json(
      { error: "That provider needs an IMAP server address." },
      { status: 400 }
    );
  }

  try {
    await verifyCredentials({ host, port, user: email, secret: password, method: "password" });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof ImapAuthError
            ? e.message
            : "Could not reach that mail server.",
      },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { error } = await service.from("email_accounts").upsert(
    {
      user_id: user.id,
      provider: providerColumn(provider.id),
      email_address: email,
      auth_method: "password",
      secret: encryptSecret(password),
      imap_host: host,
      imap_port: port,
      access_token: null,
      expires_at: null,
      needs_reauth: false,
      // Connecting a different mailbox must not inherit the old one's cursor.
      last_synced_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json(
      { error: "Could not save that connection." },
      { status: 500 }
    );
  }

  return NextResponse.json({ connected: true, email });
}
