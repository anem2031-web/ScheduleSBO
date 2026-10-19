import { describe, it, expect } from "vitest";
import {
  canTransitionPeriod,
  assertTransition,
  calculateShiftDuration,
  daysBetweenInclusive,
  isRiyadhWeek,
  assertDateString,
  ScheduleError,
} from "./schedules.service";

/**
 * اختبارات S2 — الدوال النقية لمنطق الفترات والورديات (بدون قاعدة بيانات)
 */

describe("Period state transitions (S2)", () => {
  it("allows the approved lifecycle", () => {
    expect(canTransitionPeriod("draft", "published")).toBe(true);
    expect(canTransitionPeriod("published", "locked")).toBe(true);
    expect(canTransitionPeriod("locked", "archived")).toBe(true);
    expect(canTransitionPeriod("locked", "published")).toBe(true); // إعادة فتح
    expect(canTransitionPeriod("draft", "cancelled")).toBe(true);
    expect(canTransitionPeriod("published", "cancelled")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionPeriod("draft", "locked")).toBe(false);
    expect(canTransitionPeriod("draft", "archived")).toBe(false);
    expect(canTransitionPeriod("cancelled", "draft")).toBe(false);
    expect(canTransitionPeriod("cancelled", "published")).toBe(false);
    expect(canTransitionPeriod("archived", "published")).toBe(false);
    expect(canTransitionPeriod("published", "draft")).toBe(false);
    expect(canTransitionPeriod("locked", "cancelled")).toBe(false);
  });

  it("assertTransition throws FORBIDDEN_STATE with Arabic message", () => {
    try {
      assertTransition("draft", "locked");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScheduleError);
      expect((e as ScheduleError).code).toBe("FORBIDDEN_STATE");
    }
  });
});

describe("Shift duration calculation (S2)", () => {
  it("computes a normal day shift", () => {
    expect(calculateShiftDuration("07:00", "15:00")).toEqual({
      durationMinutes: 480,
      crossesMidnight: false,
    });
  });

  it("supports HH:MM:SS input", () => {
    expect(calculateShiftDuration("15:00:00", "23:00:00").durationMinutes).toBe(
      480,
    );
  });

  it("computes a midnight-crossing shift and flags it", () => {
    expect(calculateShiftDuration("23:00", "07:00")).toEqual({
      durationMinutes: 480,
      crossesMidnight: true,
    });
    expect(calculateShiftDuration("22:30", "06:15")).toEqual({
      durationMinutes: 465,
      crossesMidnight: true,
    });
  });

  it("rejects equal start and end", () => {
    expect(() => calculateShiftDuration("08:00", "08:00")).toThrow(
      ScheduleError,
    );
  });

  it("rejects malformed times", () => {
    expect(() => calculateShiftDuration("25:00", "08:00")).toThrow();
    expect(() => calculateShiftDuration("aa:bb", "08:00")).toThrow();
    expect(() => calculateShiftDuration("08:75", "10:00")).toThrow();
  });
});

describe("Date helpers (S2)", () => {
  it("counts inclusive days", () => {
    expect(daysBetweenInclusive("2026-07-26", "2026-08-01")).toBe(7);
    expect(daysBetweenInclusive("2026-07-26", "2026-07-26")).toBe(1);
    expect(daysBetweenInclusive("2026-07-01", "2026-07-10")).toBe(10);
  });

  it("recognizes a Riyadh week (Sunday->Saturday, 7 days)", () => {
    // 2026-07-26 يوم أحد
    expect(isRiyadhWeek("2026-07-26", "2026-08-01")).toBe(true);
    // السبت لم يعد بداية الأسبوع
    expect(isRiyadhWeek("2026-07-25", "2026-07-31")).toBe(false);
    // يبدأ إثنين
    expect(isRiyadhWeek("2026-07-27", "2026-08-02")).toBe(false);
    // أحد لكنه 8 أيام
    expect(isRiyadhWeek("2026-07-26", "2026-08-02")).toBe(false);
  });

  it("recognizes a Sunday week across the calendar year and rejects invalid dates", () => {
    expect(isRiyadhWeek("2026-12-27", "2027-01-02")).toBe(true);
    expect(isRiyadhWeek("2026-02-30", "2026-03-08")).toBe(false);
    expect(isRiyadhWeek("2026-07-26", "bad-date")).toBe(false);
  });

  it("validates date strings", () => {
    expect(() => assertDateString("2026-07-26", "x")).not.toThrow();
    expect(() => assertDateString("26-07-2026", "x")).toThrow(ScheduleError);
    expect(() => assertDateString("2026-13-40", "x")).toThrow(ScheduleError);
    expect(() => assertDateString("2026-02-30", "x")).toThrow(ScheduleError);
    expect(() => assertDateString("abc", "x")).toThrow(ScheduleError);
  });
});
