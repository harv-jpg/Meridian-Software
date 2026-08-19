import { describe, expect, it } from "vitest";
import {
  addressIndex,
  buildQuery,
  fileMessage,
  parseAddress,
  parseAddressList,
} from "./inbox";
import type { GmailMessage } from "./google";
import type { ClientRecord } from "./types";

const NOW = new Date("2026-08-19T09:00:00Z");
const ME = "you@studio.co.uk";

function message(headers: Record<string, string>, over: Partial<GmailMessage> = {}) {
  return {
    id: "m1",
    threadId: "t1",
    snippet: "A snippet.",
    internalDate: String(Date.parse("2026-08-18T14:00:00Z")),
    payload: {
      headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    },
    ...over,
  } as GmailMessage;
}

describe("parseAddress", () => {
  it("takes the address out of a display-name header", () => {
    expect(parseAddress("Sam Fenn <sam@fenn.co.uk>")).toBe("sam@fenn.co.uk");
  });

  it("accepts a bare address", () => {
    expect(parseAddress("sam@fenn.co.uk")).toBe("sam@fenn.co.uk");
  });

  it("lowercases, so matching is not case-sensitive", () => {
    expect(parseAddress("Sam@Fenn.CO.UK")).toBe("sam@fenn.co.uk");
  });

  it("copes with a quoted display name containing an at-sign", () => {
    expect(parseAddress('"sam@home" <sam@fenn.co.uk>')).toBe("sam@fenn.co.uk");
  });

  it("is null for a display name with no address", () => {
    expect(parseAddress("Sam Fenn")).toBeNull();
  });

  it("is null for nothing", () => {
    expect(parseAddress(null)).toBeNull();
  });
});

describe("parseAddressList", () => {
  it("splits several recipients", () => {
    expect(parseAddressList("a@x.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("does not split on a comma inside a display name", () => {
    // "Fenn, Sam" is one recipient, not two.
    expect(parseAddressList('"Fenn, Sam" <sam@fenn.co.uk>, b@y.com')).toEqual([
      "sam@fenn.co.uk",
      "b@y.com",
    ]);
  });

  it("is empty for nothing", () => {
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe("addressIndex", () => {
  const client = (id: string, email: string | null) =>
    ({ id, email }) as ClientRecord;

  it("keys clients by lowercased email", () => {
    const index = addressIndex([client("c1", "Sam@Fenn.co.uk")]);
    expect(index.get("sam@fenn.co.uk")).toBe("c1");
  });

  it("skips clients with no email", () => {
    expect(addressIndex([client("c1", null)]).size).toBe(0);
  });

  it("keeps the first when two clients share an address", () => {
    // There is no way to tell which was meant, and picking the newer would
    // change the answer over time for the very same message.
    const index = addressIndex([
      client("c1", "shared@x.com"),
      client("c2", "shared@x.com"),
    ]);
    expect(index.get("shared@x.com")).toBe("c1");
  });
});

describe("fileMessage", () => {
  const byAddress = new Map([["sam@fenn.co.uk", "c1"]]);

  it("files an inbound message against the sender", () => {
    const filed = fileMessage(
      message({ From: "Sam Fenn <sam@fenn.co.uk>", To: ME, Subject: "Re: rebrand" }),
      ME,
      byAddress
    );
    expect(filed).toMatchObject({
      client_id: "c1",
      direction: "in",
      subject: "Re: rebrand",
      from_address: "sam@fenn.co.uk",
    });
  });

  it("files an outbound message against the recipient", () => {
    const filed = fileMessage(
      message({ From: `Me <${ME}>`, To: "Sam Fenn <sam@fenn.co.uk>" }),
      ME,
      byAddress
    );
    expect(filed).toMatchObject({ client_id: "c1", direction: "out" });
  });

  it("finds the client among several recipients", () => {
    const filed = fileMessage(
      message({ From: ME, To: "someone@else.com, sam@fenn.co.uk" }),
      ME,
      byAddress
    );
    expect(filed?.client_id).toBe("c1");
  });

  it("ignores a message involving nobody on the list", () => {
    expect(
      fileMessage(message({ From: "spam@nowhere.com", To: ME }), ME, byAddress)
    ).toBeNull();
  });

  it("does not match on domain alone", () => {
    // A colleague at the same company is not the client, and filing their
    // words under the client's name would be worse than not filing them.
    expect(
      fileMessage(
        message({ From: "someone.else@fenn.co.uk", To: ME }),
        ME,
        byAddress
      )
    ).toBeNull();
  });

  it("converts Gmail's epoch milliseconds to a timestamp", () => {
    const filed = fileMessage(
      message({ From: "sam@fenn.co.uk", To: ME }),
      ME,
      byAddress
    );
    expect(filed?.sent_at).toBe("2026-08-18T14:00:00.000Z");
  });

  it("refuses a message with no usable date", () => {
    // Undated, it cannot take its place on a chronological record.
    expect(
      fileMessage(
        message({ From: "sam@fenn.co.uk", To: ME }, { internalDate: undefined }),
        ME,
        byAddress
      )
    ).toBeNull();
  });

  it("carries the thread id through, so a conversation stays one thing", () => {
    const filed = fileMessage(
      message({ From: "sam@fenn.co.uk", To: ME }, { threadId: "t9" }),
      ME,
      byAddress
    );
    expect(filed?.thread_id).toBe("t9");
  });
});

describe("buildQuery", () => {
  it("is null when no client has an address", () => {
    expect(buildQuery([], null, NOW)).toBeNull();
  });

  it("asks about each address in both directions", () => {
    const q = buildQuery(["a@x.com"], null, NOW)!;
    expect(q).toContain("from:a@x.com OR to:a@x.com");
  });

  it("reaches back ninety days on a first sync", () => {
    // 90 days before 19 Aug 2026 is 21 May, and the extra day of overlap
    // makes it the 20th.
    expect(buildQuery(["a@x.com"], null, NOW)).toContain("after:2026/05/20");
  });

  it("overlaps the previous sync by a day", () => {
    // A message arriving between the last sync and midnight would otherwise
    // be missed forever. Re-seeing one is free — (user_id, message_id) is
    // unique, so the upsert absorbs it.
    const since = new Date("2026-08-18T23:50:00Z");
    expect(buildQuery(["a@x.com"], since, NOW)).toContain("after:2026/08/17");
  });
});
