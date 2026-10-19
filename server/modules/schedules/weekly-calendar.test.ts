import { describe, expect, it } from "vitest";
import {
  activeSupervisorLink,
  addCalendarDays,
  directIntervalMinutes,
  isCalendarDate,
  sundayOf,
  WEEK_DAY_NAMES,
} from "../../../shared/weekly-schedule";
import { operationalDate } from "../../../shared/operational-day";

describe("weekly roster calendar and intervals", () => {
  it("starts on Sunday across month and year boundaries", () => {
    expect(sundayOf("2026-10-18")).toBe("2026-10-18");
    expect(sundayOf("2026-10-24")).toBe("2026-10-18");
    expect(sundayOf("2026-11-01")).toBe("2026-11-01");
    expect(sundayOf("2027-01-01")).toBe("2026-12-27");
    expect(addCalendarDays("2026-12-27", 6)).toBe("2027-01-02");
  });
  it("labels Sunday through Saturday without remapping stored weekday numbers", () => {
    expect(WEEK_DAY_NAMES).toEqual([
      "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
    ]);
    for (let offset = 0; offset < 7; offset++) {
      const date = addCalendarDays("2026-10-18", offset);
      expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(offset);
    }
  });
  it("moves to the new operational week only at 04:30 Riyadh time on Sunday", () => {
    const beforeCutoff = operationalDate("2026-10-18T04:29:59+03:00");
    const atCutoff = operationalDate("2026-10-18T04:30:00+03:00");
    expect(beforeCutoff).toBe("2026-10-17");
    expect(sundayOf(beforeCutoff)).toBe("2026-10-11");
    expect(atCutoff).toBe("2026-10-18");
    expect(sundayOf(atCutoff)).toBe("2026-10-18");
  });
  it("rejects normalized impossible dates and invalid time fields", () => {
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(() => sundayOf("2026-02-30")).toThrow();
    expect(() =>
      directIntervalMinutes({ startTime: "25:00", endTime: "12:00" }),
    ).toThrow();
    expect(() =>
      directIntervalMinutes({ startTime: "06:00", endTime: "06:00" }),
    ).toThrow();
  });
  it("counts split periods independently and supports overnight work", () => {
    expect(
      directIntervalMinutes({ startTime: "06:00", endTime: "11:00" }) +
        directIntervalMinutes({ startTime: "18:00", endTime: "22:00" }),
    ).toBe(540);
    expect(
      directIntervalMinutes({ startTime: "22:00", endTime: "02:00" }),
    ).toBe(240);
  });
  it("checks effective supervisor links for each edited date", () => {
    const link = { effectiveFrom: "2026-10-20", effectiveTo: "2026-10-22" };
    expect(activeSupervisorLink(link, "2026-10-19")).toBe(false);
    expect(activeSupervisorLink(link, "2026-10-20")).toBe(true);
    expect(activeSupervisorLink(link, "2026-10-22")).toBe(true);
    expect(activeSupervisorLink(link, "2026-10-23")).toBe(false);
  });
});
