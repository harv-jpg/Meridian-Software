import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDuration,
  formatGBP,
  formatGBPShort,
  formatHours,
} from "./format";

describe("formatGBP", () => {
  it("renders pence as pounds with two decimals", () => {
    expect(formatGBP(187500)).toBe("£1,875.00");
    expect(formatGBP(50)).toBe("£0.50");
    expect(formatGBP(0)).toBe("£0.00");
  });

  it("groups thousands", () => {
    // The bug this guards: three separate copies of this function once
    // disagreed about separators, so the same amount rendered differently
    // depending on which screen you were looking at.
    expect(formatGBP(1234567)).toBe("£12,345.67");
  });

  it("renders an em dash for no value", () => {
    expect(formatGBP(null)).toBe("—");
    expect(formatGBP(undefined)).toBe("—");
  });

  it("does not treat zero as missing", () => {
    expect(formatGBP(0)).not.toBe("—");
  });
});

describe("formatGBPShort", () => {
  it("drops decimals below a thousand", () => {
    expect(formatGBPShort(45000)).toBe("£450");
  });

  it("abbreviates thousands to one decimal", () => {
    expect(formatGBPShort(570000)).toBe("£5.7k");
    expect(formatGBPShort(1550000)).toBe("£15.5k");
  });

  it("drops the decimal past a hundred thousand", () => {
    expect(formatGBPShort(12345600)).toBe("£123k");
  });

  it("handles negatives without mangling the sign", () => {
    expect(formatGBPShort(-570000)).toBe("£-5.7k");
  });
});

describe("formatDuration", () => {
  it("shows minutes alone under an hour", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("shows whole hours without a minutes part", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("shows both parts otherwise", () => {
    expect(formatDuration(290)).toBe("4h 50m");
  });

  it("treats zero and negatives as zero", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-10)).toBe("0m");
  });
});

describe("formatHours", () => {
  it("renders one decimal place", () => {
    expect(formatHours(140)).toBe("2.3h");
    expect(formatHours(0)).toBe("0.0h");
  });
});

describe("formatDate", () => {
  it("renders a readable UK date", () => {
    expect(formatDate("2026-08-05T00:00:00Z")).toBe("5 Aug 2026");
  });

  it("accepts a date-only string", () => {
    expect(formatDate("2026-08-05")).toBe("5 Aug 2026");
  });

  it("returns empty for no date", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });
});
