/**
 * Google OAuth and the two Gmail calls this app makes.
 *
 * Plain `fetch` against Google's REST endpoints rather than `googleapis`: that
 * package is tens of megabytes for two endpoints, and the shapes below are
 * stable and small enough to state explicitly.
 */

/** Holds the OAuth `state` between starting the flow and coming back. */
export const STATE_COOKIE = "setu_oauth_state";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Read-only, and only what is needed.
 *
 * `gmail.readonly` is a restricted scope: Google requires an annual
 * third-party security assessment before an app using it can be published to
 * everyone. Up to 100 test users are allowed without one. Nothing here can
 * send, delete or modify mail — this app writes drafts you send yourself.
 */
export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

/** Where Google sends the browser back to. Must match the console exactly. */
export function redirectUri(origin: string): string {
  return `${origin}/api/connect/google/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    // Without `offline` Google returns no refresh token, and the connection
    // dies an hour later with nothing to renew it.
    access_type: "offline",
    // Google only issues a refresh token on first consent. Forcing the prompt
    // means reconnecting after a revoke actually yields a usable token rather
    // than an access token that expires into a dead end.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function postToken(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });

  if (!res.ok) {
    throw new GoogleAuthError(`Token request failed (${res.status}).`);
  }
  return (await res.json()) as TokenSet;
}

/** Google refused the credentials — usually a revoked or expired grant. */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function exchangeCode(code: string, origin: string): Promise<TokenSet> {
  return postToken({
    code,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return postToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** The address that was connected, so settings can name it. */
export async function fetchEmailAddress(accessToken: string): Promise<string> {
  const res = await fetch(`${GMAIL}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new GoogleAuthError(`Could not read the profile (${res.status}).`);
  const data = (await res.json()) as { emailAddress: string };
  return data.emailAddress;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
}

/**
 * Message ids matching a query, newest first.
 *
 * The caller builds the query from the client addresses it cares about, so
 * Gmail does the filtering rather than this app downloading a mailbox and
 * discarding most of it.
 */
export async function listMessageIds(
  accessToken: string,
  query: string,
  max: number
): Promise<string[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(max, 100)),
  });
  const res = await fetch(`${GMAIL}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new GoogleAuthError(`Could not list messages (${res.status}).`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

/**
 * One message, metadata only.
 *
 * `format=metadata` with an explicit header list means Google never sends the
 * body over the wire. The record wants to know that a conversation happened
 * and roughly what it was about, not to hold a copy of everything said.
 */
export async function fetchMessage(
  accessToken: string,
  id: string
): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "To", "Subject", "Date"]) {
    params.append("metadataHeaders", h);
  }
  const res = await fetch(`${GMAIL}/messages/${id}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new GoogleAuthError(`Could not read a message (${res.status}).`);
  return (await res.json()) as GmailMessage;
}
