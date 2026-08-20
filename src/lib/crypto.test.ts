import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CredentialKeyError,
  decryptSecret,
  encryptSecret,
  hasCredentialKey,
  secretsMatch,
} from "./crypto";

const KEY = "a".repeat(64); // 32 bytes as hex
const OTHER_KEY = "b".repeat(64);

beforeEach(() => {
  process.env.CREDENTIAL_KEY = KEY;
});

afterEach(() => {
  delete process.env.CREDENTIAL_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips", () => {
    expect(decryptSecret(encryptSecret("abcd efgh ijkl mnop"))).toBe(
      "abcd efgh ijkl mnop"
    );
  });

  it("round-trips non-ASCII", () => {
    expect(decryptSecret(encryptSecret("påsswörd — ✓"))).toBe("påsswörd — ✓");
  });

  it("never stores the plaintext", () => {
    expect(encryptSecret("hunter2")).not.toContain("hunter2");
  });

  it("gives a different ciphertext each time", () => {
    // A fresh IV per call: identical passwords must not produce identical
    // rows, or the table leaks which users share a credential.
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("is tagged v1, so the scheme can change later", () => {
    expect(encryptSecret("x").startsWith("v1.")).toBe(true);
  });

  it("refuses a value encrypted under a different key", () => {
    const sealed = encryptSecret("secret");
    process.env.CREDENTIAL_KEY = OTHER_KEY;
    expect(() => decryptSecret(sealed)).toThrow();
  });

  it("refuses a tampered ciphertext rather than returning rubbish", () => {
    // The authentication tag is the point: a mangled row must fail loudly,
    // not decrypt to something that gets sent to a mail server.
    const sealed = encryptSecret("secret");
    const parts = sealed.split(".");
    const bytes = Buffer.from(parts[3], "base64");
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("refuses a value that is not in our format", () => {
    expect(() => decryptSecret("just-a-string")).toThrow(CredentialKeyError);
  });

  it("accepts a base64 key as well as hex", () => {
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(decryptSecret(encryptSecret("ok"))).toBe("ok");
  });
});

describe("the key itself", () => {
  it("complains clearly when unset", () => {
    delete process.env.CREDENTIAL_KEY;
    expect(() => encryptSecret("x")).toThrow(CredentialKeyError);
    expect(hasCredentialKey()).toBe(false);
  });

  it("rejects a key of the wrong length", () => {
    process.env.CREDENTIAL_KEY = "abcd";
    expect(() => encryptSecret("x")).toThrow(CredentialKeyError);
    expect(hasCredentialKey()).toBe(false);
  });

  it("is happy with a correct key", () => {
    expect(hasCredentialKey()).toBe(true);
  });
});

describe("secretsMatch", () => {
  it("is true for equal strings", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("is false for different strings of the same length", () => {
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("is false for different lengths, without throwing", () => {
    // timingSafeEqual throws on mismatched lengths; the wrapper must not.
    expect(secretsMatch("short", "much longer value")).toBe(false);
  });

  it("is false for empty against non-empty", () => {
    expect(secretsMatch("", "x")).toBe(false);
  });
});
