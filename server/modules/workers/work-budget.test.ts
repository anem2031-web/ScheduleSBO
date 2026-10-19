import { describe, expect, it } from "vitest";
import {
  excludesRequiredHours,
  revisedDailyLimit,
  summarizeWorkBudget,
  workerWeekBounds,
} from "./work-budget";

describe("worker work budget", () => {
  it("moves the default daily limit with the worker budget while preserving a custom ceiling", () => {
    expect(revisedDailyLimit(null, null, 9)).toBe(9);
    expect(revisedDailyLimit(9, 9, 10)).toBe(10);
    expect(revisedDailyLimit(9, 12, 10)).toBe(12);
    expect(revisedDailyLimit(9, 12, 13)).toBeNull();
  });
  it("excludes registered rest, holidays and leave while retaining ordinary working days", () => {
    for (const code of [
      "REST",
      "WEEKLY_REST",
      "PUBLIC_HOLIDAY",
      "ANNUAL_LEAVE",
      "UNPAID_LEAVE",
    ])
      expect(excludesRequiredHours(code)).toBe(true);
    expect(excludesRequiredHours("WORKDAY")).toBe(false);
  });
  it("keeps a Sunday–Saturday week across a month boundary", () => {
    const week = workerWeekBounds("2026-11-01");
    expect(week.start.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(week.end.toISOString().slice(0, 10)).toBe("2026-11-07");
    expect(workerWeekBounds("2026-11-07").start.toISOString()).toBe(
      week.start.toISOString(),
    );
    expect(workerWeekBounds("2026-10-31").start.toISOString().slice(0, 10)).toBe(
      "2026-10-25",
    );
  });
  it("keeps the same worker week when it crosses December and January", () => {
    const week = workerWeekBounds("2027-01-01");
    expect(week.start.toISOString().slice(0, 10)).toBe("2026-12-27");
    expect(week.end.toISOString().slice(0, 10)).toBe("2027-01-02");
  });
  it("keeps a worker's configured Saturday rest on Saturday after changing the week boundary", () => {
    const start = workerWeekBounds("2026-10-18").start;
    const dates = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    });
    const result = summarizeWorkBudget({
      dates,
      dailyMinutes: 540,
      isWorkingDay: date => new Date(`${date}T00:00:00Z`).getUTCDay() !== 6,
      scheduledByDate: new Map(),
      actualByDate: new Map(),
      refDate: "2026-10-18",
    });
    expect(dates[0]).toBe("2026-10-18");
    expect(dates[6]).toBe("2026-10-24");
    expect(result.requiredMinutes).toBe(6 * 540);
  });
  it("does not turn an unrecorded planned shift into attendance or approval", () => {
    const result = summarizeWorkBudget({
      dates: ["2026-10-18"],
      dailyMinutes: 540,
      isWorkingDay: () => true,
      scheduledByDate: new Map([["2026-10-18", 300]]),
      actualByDate: new Map(),
      refDate: "2026-10-18",
    });
    expect(result).toMatchObject({
      requiredMinutes: 540,
      scheduledMinutes: 300,
      actualMinutes: 0,
      doneMinutes: 0,
      approvedMinutes: null,
      remainingMinutes: 240,
    });
  });
  it("excludes rest and leave from required hours while preserving actual work", () => {
    const result = summarizeWorkBudget({
      dates: ["2026-10-18", "2026-10-19", "2026-10-20"],
      dailyMinutes: 540,
      isWorkingDay: (date) => date === "2026-10-18",
      scheduledByDate: new Map([["2026-10-18", 540]]),
      actualByDate: new Map([
        ["2026-10-18", 600],
        ["2026-10-19", 120],
        ["2026-10-20", 500],
      ]),
      refDate: "2026-10-19",
    });
    expect(result.requiredMinutes).toBe(540);
    expect(result.actualMinutes).toBe(720);
    expect(result.approvedMinutes).toBeNull();
  });
});
