import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Encrypting a stored mailbox credential.
 *
 * The OAuth tokens already in this app are protected by not being reachable:
 * `email_accounts` has no select policy, so the anon key cannot read them at
 * all. That is good, and it is not enough here. An app password is a
 * credential to somebody's entire mailbox, and unlike a scoped token it is
 * worth stealing on its own. A database dump — a backup on a laptop, a
 * misconfigured restore, a support export — should not hand over people's
 * email.
 *
 * So the secret is encrypted before it is written, with a key that lives in
 * the environment rather than the database. Getting the rows is then not
 * enough; you need the running application's key as well.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly rather
 * than decrypting to rubbish that gets sent to a mail server.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const KEY_BYTES = 32;
/** Bumped if the scheme ever changes, so old rows stay readable. */
const VERSION = "v1";

export class CredentialKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialKeyError";
  }
}

/**
 * The key, from `CREDENTIAL_KEY`.
 *
 * Read on every call rather than cached at module load: a module-level
 * constant is evaluated during the build, where the variable is absent, and
 * would bake in a failure that never re-checks at runtime.
 */
function key(): Buffer {
  const raw = process.env.CREDENTIAL_KEY;
  if (!raw) {
    throw new CredentialKeyError(
      "CREDENTIAL_KEY is not set. Generate one with: openssl rand -hex 32"
    );
  }

  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (buf.length !== KEY_BYTES) {
    throw new CredentialKeyError(
      `CREDENTIAL_KEY must be ${KEY_BYTES} bytes (64 hex characters); got ${buf.length}.`
    );
  }
  return buf;
}

/** True when a key is present and usable, for the "is this configured" checks. */
export function hasCredentialKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CredentialKeyError("Stored credential is not in a format we recognise.");
  }

  const [, iv, tag, ciphertext] = parts;
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  // Throws if the tag does not match — a tampered or truncated row fails here
  // rather than producing a plausible-looking wrong password.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Constant-time string comparison, for the cron secret.
 *
 * `===` on a secret leaks its length and how much of a guess was right
 * through timing. The difference is small over a network, but this costs
 * nothing to get right.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal; compare padded copies instead and fold the length in.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
