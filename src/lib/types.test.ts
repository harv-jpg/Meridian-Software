import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFollowUpDue, isOverdue, todayISO } from "./types";

// Pinned so "today" never shifts under the tests, and so the boundary cases
// below mean something rather than passing by luck.
const NOW = new Date("2026-08-14T09:30:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("todayISO", () => {
  it("gives a date-only string", () => {
    expect(todayISO()).toBe("2026-08-14");
  });
});

describe("isOverdue", () => {
  it("is true once the due date has passed", () => {
    expect(isOverdue({ due_date: "2026-08-13", status: "sent" })).toBe(true);
  });

  it("is false on the due date itself", () => {
    // An invoice due today is not late yet — this is the boundary that
    // separates it from a follow-up.
    expect(isOverdue({ due_date: "2026-08-14", status: "sent" })).toBe(false);
  });

  it("is false before the due date", () => {
    expect(isOverdue({ due_date: "2026-08-20", status: "sent" })).toBe(false);
  });

  it("is false once paid, however late", () => {
    expect(isOverdue({ due_date: "2020-01-01", status: "paid" })).toBe(false);
  });

  it("is false with no due date", () => {
    expect(isOverdue({ due_date: null, status: "sent" })).toBe(false);
  });

  it("applies to drafts too", () => {
    expect(isOverdue({ due_date: "2026-08-01", status: "draft" })).toBe(true);
  });
});

describe("isFollowUpDue", () => {
  it("is true on the day itself", () => {
    // Deliberately different from isOverdue: you chase someone on the day
    // you said you would.
    expect(isFollowUpDue({ follow_up_on: "2026-08-14" })).toBe(true);
  });

  it("is true once the day has passed", () => {
    expect(isFollowUpDue({ follow_up_on: "2026-07-01" })).toBe(true);
  });

  it("is false while still scheduled", () => {
    expect(isFollowUpDue({ follow_up_on: "2026-08-15" })).toBe(false);
  });

  it("is false with no date set", () => {
    expect(isFollowUpDue({ follow_up_on: null })).toBe(false);
  });
});
