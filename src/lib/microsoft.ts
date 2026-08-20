/**
 * Microsoft OAuth, for Outlook and Microsoft 365.
 *
 * Microsoft retired basic authentication for IMAP, so a password will not
 * reach these mailboxes at all. What replaces it is an access token used as
 * XOAUTH2 over the ordinary IMAP connection — so this file produces a
 * credential, and `imap.ts` does the same work with it as with any other.
 *
 * Unlike Google, Microsoft asks nothing for this: an app registration is free
 * and there is no paid security assessment standing between you and
 * production.
 */

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

/** Holds the OAuth `state` between starting the flow and coming back. */
export const MS_STATE_COOKIE = "setu_ms_state";

/**
 * `offline_access` is what yields a refresh token; without it the connection
 * dies in an hour. The IMAP scope is the narrowest Microsoft offers for this —
 * it grants mail access as the signed-in user and nothing else.
 */
export const MS_SCOPES = [
  "offline_access",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "openid",
  "email",
];

export class MicrosoftAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrosoftAuthError";
  }
}

export function isMicrosoftConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
}

export function msRedirectUri(origin: string): string {
  return `${origin}/api/connect/microsoft/callback`;
}

export function msAuthorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: msRedirectUri(origin),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
  });
  return `${AUTHORITY}/authorize?${params}`;
}

export interface MsTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function postToken(body: Record<string, string>): Promise<MsTokenSet> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      scope: MS_SCOPES.join(" "),
      ...body,
    }),
  });

  if (!res.ok) {
    throw new MicrosoftAuthError(`Microsoft refused the request (${res.status}).`);
  }
  return (await res.json()) as MsTokenSet;
}

export function msExchangeCode(code: string, origin: string): Promise<MsTokenSet> {
  return postToken({
    code,
    redirect_uri: msRedirectUri(origin),
    grant_type: "authorization_code",
  });
}

export function msRefresh(refreshToken: string): Promise<MsTokenSet> {
  return postToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/**
 * Which mailbox was connected.
 *
 * From the id token rather than a Graph call: it is already in the token
 * response, and asking Graph for a profile would mean requesting a scope this
 * app has no other use for.
 */
export function addressFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { email?: string; preferred_username?: string };
    return json.email ?? json.preferred_username ?? null;
  } catch {
    return null;
  }
}
