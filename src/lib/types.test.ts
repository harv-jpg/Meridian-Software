import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysSince,
  isFollowUpDue,
  isOverdue,
  isQuiet,
  lastTouchedAt,
  todayISO,
} from "./types";

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

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince("2026-08-04T09:30:00Z")).toBe(10);
  });

  it("floors a partial day", () => {
    // 23h59m earlier is still today.
    expect(daysSince("2026-08-13T09:31:00Z")).toBe(0);
  });

  it("clamps a future date to zero rather than going negative", () => {
    expect(daysSince("2026-09-01T00:00:00Z")).toBe(0);
  });

  it("survives an unparseable value", () => {
    expect(daysSince("not a date")).toBe(0);
  });
});

describe("lastTouchedAt", () => {
  const client = {
    id: "c1",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };

  it("uses the row's own timestamp when there is nothing else", () => {
    expect(lastTouchedAt(client)).toBe("2026-07-01T00:00:00Z");
  });

  it("prefers a more recent invoice", () => {
    expect(
      lastTouchedAt(client, [{ client_id: "c1", created_at: "2026-08-10T00:00:00Z" }])
    ).toBe("2026-08-10T00:00:00Z");
  });

  it("ignores an older invoice", () => {
    expect(
      lastTouchedAt(client, [{ client_id: "c1", created_at: "2026-06-15T00:00:00Z" }])
    ).toBe("2026-07-01T00:00:00Z");
  });

  it("ignores another client's invoice", () => {
    expect(
      lastTouchedAt(client, [{ client_id: "c2", created_at: "2026-08-10T00:00:00Z" }])
    ).toBe("2026-07-01T00:00:00Z");
  });

  it("falls back to created_at when updated_at is missing", () => {
    // Rows written before the touch trigger existed.
    expect(lastTouchedAt({ ...client, updated_at: "" })).toBe("2026-06-01T00:00:00Z");
  });
});

describe("isQuiet", () => {
  const base = {
    id: "c1",
    stage: "proposal_sent" as const,
    follow_up_on: null,
    archived_at: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z", // 44 days before NOW
  };

  it("flags an open deal untouched for three weeks", () => {
    expect(isQuiet(base)).toBe(true);
  });

  it("does not flag one touched yesterday", () => {
    expect(isQuiet({ ...base, updated_at: "2026-08-13T00:00:00Z" })).toBe(false);
  });

  it("is false on the day before the threshold", () => {
    // 20 days: not yet.
    expect(isQuiet({ ...base, updated_at: "2026-07-25T09:30:00Z" })).toBe(false);
  });

  it("is true on the threshold itself", () => {
    expect(isQuiet({ ...base, updated_at: "2026-07-24T09:30:00Z" })).toBe(true);
  });

  it("counts a recent invoice as activity", () => {
    expect(
      isQuiet(base, [{ client_id: "c1", created_at: "2026-08-12T00:00:00Z" }])
    ).toBe(false);
  });

  it("leaves closed deals alone", () => {
    expect(isQuiet({ ...base, stage: "won" })).toBe(false);
    expect(isQuiet({ ...base, stage: "lost" })).toBe(false);
  });

  it("leaves archived clients alone", () => {
    expect(isQuiet({ ...base, archived_at: "2026-07-02T00:00:00Z" })).toBe(false);
  });

  it("stays quiet about a client you have already scheduled", () => {
    // A follow-up date means you have decided when to chase; isFollowUpDue
    // raises it on the day, and listing it twice helps nobody.
    expect(isQuiet({ ...base, follow_up_on: "2026-09-01" })).toBe(false);
    expect(isQuiet({ ...base, follow_up_on: "2026-08-01" })).toBe(false);
  });
});
