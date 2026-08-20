import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, hasCredentialKey } from "@/lib/crypto";
import {
  MS_STATE_COOKIE,
  addressFromIdToken,
  isMicrosoftConfigured,
  msExchangeCode,
} from "@/lib/microsoft";
import { findProvider } from "@/lib/providers";

/** Back to settings with a message the page knows how to render. */
function settings(request: Request, outcome: string) {
  const url = new URL("/dashboard/settings", request.url);
  url.searchParams.set("inbox", outcome);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get(MS_STATE_COOKIE)?.value;
  // Single-use, whatever happens next.
  jar.delete(MS_STATE_COOKIE);

  if (!isMicrosoftConfigured() || !hasCredentialKey()) {
    return settings(request, "unconfigured");
  }
  if (url.searchParams.get("error")) return settings(request, "cancelled");

  const state = url.searchParams.get("state");
  if (!expected || !state || state !== expected) {
    return settings(request, "state");
  }

  const code = url.searchParams.get("code");
  if (!code) return settings(request, "failed");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = (await msExchangeCode(code, url.origin)) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
    };

    // Without a refresh token the connection dies within the hour and there is
    // nothing to renew it with. Better to fail visibly than to store something
    // that stops working tomorrow.
    if (!tokens.refresh_token) return settings(request, "norefresh");

    const address = addressFromIdToken(tokens.id_token);
    if (!address) return settings(request, "failed");

    const outlook = findProvider("outlook")!;
    const service = createServiceClient();
    const { error } = await service.from("email_accounts").upsert(
      {
        user_id: user.id,
        provider: "microsoft",
        email_address: address,
        auth_method: "oauth",
        secret: encryptSecret(tokens.refresh_token),
        access_token: encryptSecret(tokens.access_token),
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        imap_host: outlook.host,
        imap_port: outlook.port,
        needs_reauth: false,
        last_synced_at: null,
      },
      { onConflict: "user_id" }
    );

    if (error) return settings(request, "failed");
    return settings(request, "connected");
  } catch {
    return settings(request, "failed");
  }
}
