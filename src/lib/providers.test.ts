import { describe, expect, it } from "vitest";
import { findProvider, normaliseSecret, providerColumn } from "./providers";

const gmail = findProvider("gmail")!;
const custom = findProvider("custom")!;

describe("normaliseSecret", () => {
  it("strips the spaces Google puts in an app password", () => {
    // Google displays "abcd efgh ijkl mnop"; the spaces are formatting, and
    // pasting them verbatim gets an unhelpful rejection from the server.
    expect(normaliseSecret(gmail, "abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });

  it("leaves an already-stripped app password alone", () => {
    expect(normaliseSecret(gmail, "abcdefghijklmnop")).toBe("abcdefghijklmnop");
  });

  it("handles a paste that picked up surrounding whitespace", () => {
    expect(normaliseSecret(gmail, "  abcd efgh ijkl mnop\n")).toBe("abcdefghijklmnop");
  });

  it("keeps internal spaces for a custom host", () => {
    // A self-chosen password may genuinely contain a space, and removing it
    // would break a credential that works.
    expect(normaliseSecret(custom, "correct horse battery")).toBe(
      "correct horse battery"
    );
  });

  it("still trims a custom password", () => {
    expect(normaliseSecret(custom, "  hunter2  ")).toBe("hunter2");
  });
});

describe("providerColumn", () => {
  it("records Outlook as microsoft", () => {
    expect(providerColumn("outlook")).toBe("microsoft");
  });

  it("records Gmail-by-app-password as imap, not google", () => {
    // A `google` row would mean the Gmail API, which is a different
    // permission regime entirely.
    expect(providerColumn("gmail")).toBe("imap");
  });

  it("records a custom host as imap", () => {
    expect(providerColumn("custom")).toBe("imap");
  });
});
