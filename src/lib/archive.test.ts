import { describe, expect, it } from "vitest";
import { describeAttached } from "./archive";

describe("describeAttached", () => {
  it("is null when nothing is attached", () => {
    expect(
      describeAttached({ time: 0, invoices: 0, contracts: 0, emails: 0 })
    ).toBeNull();
  });

  it("is null for a client with no counts at all", () => {
    expect(describeAttached(undefined)).toBeNull();
  });

  it("uses the singular for one", () => {
    expect(
      describeAttached({ time: 0, invoices: 1, contracts: 0, emails: 0 })
    ).toBe("1 invoice");
  });

  it("uses the plural for more than one", () => {
    expect(
      describeAttached({ time: 3, invoices: 0, contracts: 0, emails: 0 })
    ).toBe("3 time entries");
  });

  it("joins two with 'and'", () => {
    expect(
      describeAttached({ time: 2, invoices: 1, contracts: 0, emails: 0 })
    ).toBe("2 time entries and 1 invoice");
  });

  it("joins three or more with commas and a final 'and'", () => {
    expect(
      describeAttached({ time: 2, invoices: 1, contracts: 4, emails: 9 })
    ).toBe("2 time entries, 1 invoice, 4 contracts and 9 filed emails");
  });

  it("skips the kinds that are zero", () => {
    expect(
      describeAttached({ time: 0, invoices: 2, contracts: 0, emails: 5 })
    ).toBe("2 invoices and 5 filed emails");
  });
});
