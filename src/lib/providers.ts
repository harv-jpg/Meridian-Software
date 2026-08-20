/**
 * The mail hosts we know how to reach, and how each one wants to be asked.
 *
 * Every entry ends up on the same IMAP connection running the same fetch. The
 * only thing that varies is the credential, which is why adding a provider
 * here is a few lines rather than an integration.
 */

export type AuthMethod = "password" | "oauth";
export type ProviderId = "gmail" | "outlook" | "fastmail" | "icloud" | "custom";

export interface Provider {
  id: ProviderId;
  label: string;
  host: string;
  port: number;
  method: AuthMethod;
  /** Where the user goes to create the credential, for password providers. */
  setupUrl?: string;
  /** Shown under the form; says what they are about to be asked for. */
  hint?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "gmail",
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    method: "password",
    setupUrl: "https://myaccount.google.com/apppasswords",
    hint: "Needs 2-step verification switched on. Google then gives you a 16-character app password — that, not your normal one.",
  },
  {
    id: "outlook",
    label: "Outlook",
    host: "outlook.office365.com",
    port: 993,
    method: "oauth",
    hint: "Microsoft retired password access for mail apps, so this one goes through a sign-in page instead.",
  },
  {
    id: "fastmail",
    label: "Fastmail",
    host: "imap.fastmail.com",
    port: 993,
    method: "password",
    setupUrl: "https://app.fastmail.com/settings/security/apps",
    hint: "Create an app password with the Mail (IMAP) permission.",
  },
  {
    id: "icloud",
    label: "iCloud",
    host: "imap.mail.me.com",
    port: 993,
    method: "password",
    setupUrl: "https://account.apple.com/account/manage",
    hint: "Needs two-factor authentication on. Generate an app-specific password under Sign-In and Security.",
  },
  {
    id: "custom",
    label: "Something else",
    host: "",
    port: 993,
    method: "password",
    hint: "Your host's IMAP server — often imap.yourdomain.com or a name your email provider gives you. Port 993 unless told otherwise.",
  },
];

export function findProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Which `provider` column value a connection gets.
 *
 * Deliberately coarser than the picker: the column records how we authenticate
 * and talk to the host, and every password provider is reached identically.
 * Gmail-via-app-password is an `imap` connection, not a `google` one — a
 * `google` row would mean the Gmail API, which is a different permission
 * regime entirely.
 */
export function providerColumn(id: ProviderId): "google" | "microsoft" | "imap" {
  return id === "outlook" ? "microsoft" : "imap";
}
