import { describe, it, expect } from "vitest";
import {
  toMinutes,
  assignmentInterval,
  intervalsOverlap,
  dayDiff,
  conflictsWith,
  findConflict,
  type ExistingAssignment,
} from "./assignments.conflict";
import { ScheduleError } from "./schedules.service";

/**
 * اختبارات S3 — محرك التعارض الزمني (دوال نقية)
 */

const mk = (
  id: number,
  workDate: string,
  startTime: string,
  endTime: string,
  crossesMidnight = false
): ExistingAssignment => ({ id, workDate, startTime, endTime, crossesMidnight });

describe("Conflict engine primitives (S3)", () => {
  it("toMinutes parses and validates", () => {
    expect(toMinutes("07:30")).toBe(450);
    expect(toMinutes("00:00")).toBe(0);
    expect(() => toMinutes("24:00")).toThrow(ScheduleError);
  });

  it("assignmentInterval handles midnight crossing", () => {
    expect(assignmentInterval("23:00", "07:00", true)).toEqual({
      startMin: 1380,
      endMin: 1860,
    });
    expect(assignmentInterval("07:00", "15:00", false)).toEqual({
      startMin: 420,
      endMin: 900,
    });
  });

  it("assignmentInterval rejects inconsistent flags", () => {
    // معلّمة عابرة لكن النهاية بعد البداية
    expect(() => assignmentInterval("07:00", "15:00", true)).toThrow();
    // غير معلّمة لكن النهاية قبل البداية
    expect(() => assignmentInterval("23:00", "07:00", false)).toThrow();
  });

  it("touching boundaries do not overlap", () => {
    expect(
      intervalsOverlap({ startMin: 420, endMin: 900 }, { startMin: 900, endMin: 1380 })
    ).toBe(false);
  });

  it("dayDiff computes signed day difference", () => {
    expect(dayDiff("2026-07-26", "2026-07-27")).toBe(1);
    expect(dayDiff("2026-07-27", "2026-07-26")).toBe(-1);
    expect(dayDiff("2026-07-26", "2026-07-26")).toBe(0);
  });
});

describe("Conflict detection scenarios (S3)", () => {
  it("same-day overlapping shifts conflict", () => {
    const existing = [mk(1, "2026-07-26", "07:00", "15:00")];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "14:00",
        endTime: "22:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict?.id).toBe(1);
  });

  it("same-day back-to-back shifts do NOT conflict", () => {
    const existing = [mk(1, "2026-07-26", "07:00", "15:00")];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "15:00",
        endTime: "23:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict).toBeNull();
  });

  it("yesterday's midnight-crossing shift conflicts with today's early shift", () => {
    // أمس 23:00 -> 07:00 (يمتد لصباح اليوم)
    const existing = [mk(1, "2026-07-25", "23:00", "07:00", true)];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "06:00",
        endTime: "14:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict?.id).toBe(1);
  });

  it("yesterday's midnight-crossing shift does not conflict after its end", () => {
    const existing = [mk(1, "2026-07-25", "23:00", "07:00", true)];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "07:00",
        endTime: "15:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict).toBeNull();
  });

  it("today's midnight-crossing candidate conflicts with tomorrow's morning", () => {
    const existing = [mk(1, "2026-07-27", "06:00", "14:00")];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "23:00",
        endTime: "07:00",
        crossesMidnight: true,
      },
      existing
    );
    expect(conflict?.id).toBe(1);
  });

  it("assignments two days apart never conflict", () => {
    const existing = [mk(1, "2026-07-24", "23:00", "07:00", true)];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "06:00",
        endTime: "14:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict).toBeNull();
  });

  it("multiple supervisors, non-overlapping shifts allowed (two shifts same day)", () => {
    const existing = [
      mk(1, "2026-07-26", "07:00", "12:00"),
      mk(2, "2026-07-26", "18:00", "22:00"),
    ];
    const conflict = findConflict(
      {
        workDate: "2026-07-26",
        startTime: "13:00",
        endTime: "17:00",
        crossesMidnight: false,
      },
      existing
    );
    expect(conflict).toBeNull();
  });
});
