import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  itemsTotalPence,
  lineTotalPence,
  parsePricePence,
  parseQuantity,
} from "./invoice";

const line = (quantity_centi: number, unit_price_pence: number) => ({
  quantity_centi,
  unit_price_pence,
});

describe("lineTotalPence", () => {
  it("multiplies a whole quantity by the unit price", () => {
    expect(lineTotalPence(line(100, 5000))).toBe(5000);
    expect(lineTotalPence(line(300, 5000))).toBe(15000);
  });

  it("handles fractional quantities", () => {
    // 1.5 hours at £50 = £75
    expect(lineTotalPence(line(150, 5000))).toBe(7500);
    // 0.25 days at £400 = £100
    expect(lineTotalPence(line(25, 40000))).toBe(10000);
  });

  it("rounds to whole pence rather than leaving fractions", () => {
    // 0.33 × £10.00 = £3.30 exactly; 0.333 would not be representable
    expect(lineTotalPence(line(33, 1000))).toBe(330);
    // 1.5 × £0.01 = 0.015p, rounds away from zero to 2
    expect(lineTotalPence(line(150, 1))).toBe(2);
  });

  it("is zero when the unit price is zero", () => {
    expect(lineTotalPence(line(500, 0))).toBe(0);
  });
});

describe("itemsTotalPence", () => {
  it("sums the lines", () => {
    expect(
      itemsTotalPence([line(150, 5000), line(100, 20000), line(200, 2500)])
    ).toBe(7500 + 20000 + 5000);
  });

  it("is zero for no items", () => {
    expect(itemsTotalPence([])).toBe(0);
  });

  it("sums rounded lines, not the rounding of the sum", () => {
    // Each line rounds independently in the database trigger, so the
    // client-side total has to round the same way or the figure on screen
    // will disagree with the figure that gets stored.
    expect(itemsTotalPence([line(150, 1), line(150, 1)])).toBe(4);
  });
});

describe("formatQuantity", () => {
  it("drops the decimal for whole numbers", () => {
    expect(formatQuantity(100)).toBe("1");
    expect(formatQuantity(300)).toBe("3");
  });

  it("keeps meaningful decimals", () => {
    expect(formatQuantity(150)).toBe("1.5");
    expect(formatQuantity(25)).toBe("0.25");
  });
});

describe("parseQuantity", () => {
  it("converts to hundredths", () => {
    expect(parseQuantity("1.5")).toBe(150);
    expect(parseQuantity("2")).toBe(200);
    expect(parseQuantity("0.25")).toBe(25);
  });

  it("rejects zero, negatives and nonsense", () => {
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
});

describe("parsePricePence", () => {
  it("converts pounds to pence", () => {
    expect(parsePricePence("12.50")).toBe(1250);
    expect(parsePricePence("50")).toBe(5000);
  });

  it("allows zero but not negatives", () => {
    expect(parsePricePence("0")).toBe(0);
    expect(parsePricePence("-5")).toBeNull();
  });

  it("rejects nonsense", () => {
    expect(parsePricePence("")).toBeNull();
    expect(parsePricePence("free")).toBeNull();
  });
});
