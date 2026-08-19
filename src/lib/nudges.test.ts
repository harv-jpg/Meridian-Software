import { describe, expect, it } from "vitest";
import { groupByClient, selectCandidates, MAX_PER_USER } from "./nudges";
import type { ClientRecord, EmailMessage, Invoice } from "./types";

// Pinned, so the quiet threshold and the overdue boundary are exercised
// deliberately rather than passing by luck on the day the tests run.
const NOW = new Date("2026-08-19T09:00:00Z");
const back = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();
const backDate = (days: number) => back(days).slice(0, 10);

function client(over: Partial<ClientRecord> & { id: string }): ClientRecord {
  return {
    user_id: "u1",
    name: "A client",
    email: null,
    phone: null,
    company: null,
    stage: "proposal_sent",
    value_pence: 100000,
    notes: null,
    address: null,
    follow_up_on: null,
    archived_at: null,
    created_at: back(120),
    updated_at: back(2),
    ...over,
  };
}

function invoice(over: Partial<Invoice> & { id: string; client_id: string }): Invoice {
  return {
    invoice_number: 1,
    amount_pence: 100000,
    basis: "fixed",
    status: "sent",
    vat_rate_bp: 0,
    due_date: null,
    share_token: "tok",
    created_at: back(20),
    ...over,
  } as Invoice;
}

const noneWaiting = new Set<string>();
const noEmails = new Map<string, EmailMessage[]>();

describe("groupByClient", () => {
  it("buckets by client in one pass", () => {
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1" }),
      invoice({ id: "i2", client_id: "c2" }),
      invoice({ id: "i3", client_id: "c1" }),
    ]);
    expect(grouped.get("c1")).toHaveLength(2);
    expect(grouped.get("c2")).toHaveLength(1);
    expect(grouped.get("c3")).toBeUndefined();
  });
});

describe("selectCandidates", () => {
  it("picks a quiet client", () => {
    const c = client({ id: "c1", updated_at: back(30) });
    const picked = selectCandidates([c], new Map(), noneWaiting, noEmails, NOW);
    expect(picked).toEqual([{ client: c, reason: "silence" }]);
  });

  it("leaves a recently touched client alone", () => {
    const c = client({ id: "c1", updated_at: back(3) });
    expect(selectCandidates([c], new Map(), noneWaiting, noEmails, NOW)).toEqual([]);
  });

  it("picks a client with an overdue invoice even if recently touched", () => {
    // Being in touch does not make the money less late.
    const c = client({ id: "c1", updated_at: back(1) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(5) }),
    ]);
    expect(selectCandidates([c], grouped, noneWaiting, noEmails, NOW)).toEqual([
      { client: c, reason: "payment" },
    ]);
  });

  it("prefers payment over silence when both apply", () => {
    const c = client({ id: "c1", updated_at: back(60) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(5) }),
    ]);
    expect(selectCandidates([c], grouped, noneWaiting, noEmails, NOW)[0].reason).toBe("payment");
  });

  it("ignores an invoice that is not late yet", () => {
    const c = client({ id: "c1", updated_at: back(2) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(-5) }),
    ]);
    expect(selectCandidates([c], grouped, noneWaiting, noEmails, NOW)).toEqual([]);
  });

  it("skips a client that already has an unresolved nudge of that kind", () => {
    const c = client({ id: "c1", updated_at: back(30) });
    const waiting = new Set(["c1:silence"]);
    expect(selectCandidates([c], new Map(), waiting, noEmails, NOW)).toEqual([]);
  });

  it("still nudges about money when only a silence draft is waiting", () => {
    // Different fact, different email — the parked silence draft says nothing
    // about the invoice that has since gone past its date.
    const c = client({ id: "c1", updated_at: back(30) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(2) }),
    ]);
    const waiting = new Set(["c1:silence"]);
    expect(selectCandidates([c], grouped, waiting, noEmails, NOW)[0].reason).toBe("payment");
  });

  it("never nudges about an archived client", () => {
    const c = client({ id: "c1", updated_at: back(60), archived_at: back(10) });
    expect(selectCandidates([c], new Map(), noneWaiting, noEmails, NOW)).toEqual([]);
  });

  it("never nudges about a closed deal", () => {
    expect(
      selectCandidates(
        [client({ id: "c1", updated_at: back(60), stage: "won" })],
        new Map(),
        noneWaiting, noEmails, NOW)
    ).toEqual([]);
  });

  it("still chases an overdue invoice on a won deal", () => {
    // The deal is closed; the money is not. This is the case that would be
    // silently dropped if payment reused the quiet-stage rules.
    const c = client({ id: "c1", stage: "won", updated_at: back(1) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(9) }),
    ]);
    expect(selectCandidates([c], grouped, noneWaiting, noEmails, NOW)[0].reason).toBe("payment");
  });

  it("respects the per-user cap", () => {
    const many = Array.from({ length: MAX_PER_USER + 2 }, (_, i) =>
      client({ id: `c${i}`, updated_at: back(40) })
    );
    expect(selectCandidates(many, new Map(), noneWaiting, noEmails, NOW)).toHaveLength(
      MAX_PER_USER
    );
  });

  it("caps each user separately rather than the whole run", () => {
    const mine = Array.from({ length: MAX_PER_USER + 1 }, (_, i) =>
      client({ id: `a${i}`, user_id: "u1", updated_at: back(40) })
    );
    const theirs = Array.from({ length: MAX_PER_USER + 1 }, (_, i) =>
      client({ id: `b${i}`, user_id: "u2", updated_at: back(40) })
    );
    const picked = selectCandidates([...mine, ...theirs], new Map(), noneWaiting, noEmails, NOW);
    expect(picked).toHaveLength(MAX_PER_USER * 2);
    expect(picked.filter((p) => p.client.user_id === "u1")).toHaveLength(MAX_PER_USER);
    expect(picked.filter((p) => p.client.user_id === "u2")).toHaveLength(MAX_PER_USER);
  });

  it("treats a recent email as activity", () => {
    // The whole point of the inbox sync: a client who replied last week is
    // not quiet, whatever their client row's updated_at says.
    const c = client({ id: "c1", updated_at: back(40) });
    const emails = new Map<string, EmailMessage[]>([
      [
        "c1",
        [{ client_id: "c1", sent_at: back(4) } as EmailMessage],
      ],
    ]);
    expect(selectCandidates([c], new Map(), noneWaiting, emails, NOW)).toEqual([]);
  });

  it("is unmoved by an old email", () => {
    const c = client({ id: "c1", updated_at: back(40) });
    const emails = new Map<string, EmailMessage[]>([
      [
        "c1",
        [{ client_id: "c1", sent_at: back(50) } as EmailMessage],
      ],
    ]);
    expect(
      selectCandidates([c], new Map(), noneWaiting, emails, NOW)[0].reason
    ).toBe("silence");
  });

  it("ignores another client's email", () => {
    const c = client({ id: "c1", updated_at: back(40) });
    const emails = new Map<string, EmailMessage[]>([
      ["c2", [{ client_id: "c2", sent_at: back(1) } as EmailMessage]],
    ]);
    expect(
      selectCandidates([c], new Map(), noneWaiting, emails, NOW)
    ).toHaveLength(1);
  });

  it("still chases money even after a recent reply", () => {
    // They wrote back; they still have not paid.
    const c = client({ id: "c1", updated_at: back(40) });
    const grouped = groupByClient([
      invoice({ id: "i1", client_id: "c1", due_date: backDate(6) }),
    ]);
    const emails = new Map<string, EmailMessage[]>([
      ["c1", [{ client_id: "c1", sent_at: back(2) } as EmailMessage]],
    ]);
    expect(
      selectCandidates([c], grouped, noneWaiting, emails, NOW)[0].reason
    ).toBe("payment");
  });

  it("leaves a client with a follow-up date to the follow-up system", () => {
    const c = client({
      id: "c1",
      updated_at: back(60),
      follow_up_on: backDate(-3),
    });
    expect(selectCandidates([c], new Map(), noneWaiting, noEmails, NOW)).toEqual([]);
  });
});
