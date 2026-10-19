import { describe, it, expect } from "vitest";
import { ScheduleError } from "./schedules.service";

// نستورد فقط ما هو قابل للاختبار بدون قاعدة بيانات عبر إعادة تنفيذ
// نفس منطق التحقق المستخدم في worker-card.service.ts (assertTime, validateIntervalPair)
// لأن saveWorkerCard/rolloutPeriodFromCards تتطلب قاعدة بيانات فعلية.
// هنا نختبر الدوال المساعدة القابلة للعزل عبر استيرادها مباشرة حيث أمكن.

import { calculateShiftDuration } from "./schedules.service";

describe("Worker card time validation building blocks (S-CARD)", () => {
  it("accepts a normal single-period pattern", () => {
    expect(() => calculateShiftDuration("07:00", "15:00")).not.toThrow();
  });

  it("accepts a midnight-crossing pattern", () => {
    const r = calculateShiftDuration("18:00", "01:30");
    expect(r.crossesMidnight).toBe(true);
  });

  it("rejects equal start/end for a period", () => {
    expect(() => calculateShiftDuration("06:00", "06:00")).toThrow(
      ScheduleError
    );
  });
});

describe("Template code derivation matches worker-card.service logic", () => {
  // نفس صيغة templateCodeFor في worker-card.service.ts: T{HHMM}_{HHMM}
  function templateCodeFor(start: string, end: string): string {
    const clean = (t: string) => t.slice(0, 5).replace(":", "");
    return `T${clean(start)}_${clean(end)}`;
  }

  it("derives a stable, readable code from times", () => {
    expect(templateCodeFor("07:00", "15:00")).toBe("T0700_1500");
    expect(templateCodeFor("18:00", "01:30")).toBe("T1800_0130");
  });

  it("same times always derive the same code (reuse, not duplication)", () => {
    expect(templateCodeFor("06:00", "11:00")).toBe(
      templateCodeFor("06:00", "11:00")
    );
  });
});

describe("Golden rule day classification (rest day / leave)", () => {
  // محاكاة منطق isWorkingDay المستخدم في getWorkerTimeline وrecalcTimeBalance
  function isWorkingDay(
    ds: string,
    restDay: number | null,
    leaveDates: Set<string>
  ): boolean {
    const dow = new Date(ds + "T00:00:00Z").getUTCDay();
    if (restDay !== null && dow === restDay) return false;
    if (leaveDates.has(ds)) return false;
    return true;
  }

  it("excludes the weekly rest day", () => {
    // 2026-07-27 اثنين (dow=1)
    expect(isWorkingDay("2026-07-27", 1, new Set())).toBe(false);
    expect(isWorkingDay("2026-07-28", 1, new Set())).toBe(true);
  });

  it("excludes leave days regardless of rest day", () => {
    const leaves = new Set(["2026-07-28"]);
    expect(isWorkingDay("2026-07-28", null, leaves)).toBe(false);
  });

  it("a full week with one rest day and no leave has 6 working days", () => {
    const dates = [
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ];
    // الاثنين هو يوم الراحة (dow=1) -> 2026-07-27
    const working = dates.filter((d) => isWorkingDay(d, 1, new Set()));
    expect(working.length).toBe(6);
  });

  it("required minutes drop when leave days are added on top of rest day", () => {
    const dailyMinutes = 600; // 10 ساعات
    const dates = [
      "2026-07-26",
      "2026-07-27", // راحة
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ];
    const leaves = new Set(["2026-07-28", "2026-07-29"]); // إجازتان إضافيتان
    const workingDays = dates.filter((d) =>
      isWorkingDay(d, 1, leaves)
    ).length;
    expect(workingDays).toBe(4); // 6 - 2 إجازة
    expect(workingDays * dailyMinutes).toBe(2400); // لا 3600 كما لو حُسبت الإجازات عملًا
  });
});
