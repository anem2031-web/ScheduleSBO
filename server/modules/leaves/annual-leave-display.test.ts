import { describe, expect, it } from "vitest";
import {
  annualLeaveDayNumber,
  enrichAnnualLeaveCalendar,
} from "./annual-leave-display";

const request = {
  id: 7,
  workerId: 41,
  leaveKind: "annual",
  status: "approved",
  startDate: "2026-09-28",
  endDate: "2026-11-03",
};
const entry = (date = "2026-10-24") => ({
  workerId: 41,
  date,
  requestId: 7,
  code: "ANNUAL_LEAVE",
  label: "إجازة سنوية",
});

describe("annual leave elapsed-day display", () => {
  it("uses the original request date across weeks, months, and years", () => {
    expect(annualLeaveDayNumber("2026-09-28", "2026-09-28")).toBe(1);
    expect(annualLeaveDayNumber("2026-10-24", "2026-09-28")).toBe(27);
    expect(annualLeaveDayNumber("2027-01-02", "2026-12-20")).toBe(14);
    expect(annualLeaveDayNumber("2024-03-01", "2024-02-28")).toBe(3);
    expect(enrichAnnualLeaveCalendar([entry()], [request])[0]).toMatchObject({
      label: "إجازة سنوية V27",
      annualLeaveStartDate: "2026-09-28",
      annualLeaveDay: 27,
    });
  });

  it("does not restart at the visible week's first date", () => {
    const rows = enrichAnnualLeaveCalendar(
      [entry("2026-10-18"), entry("2026-10-24")],
      [request],
    );
    expect(rows.map((row) => row.annualLeaveDay)).toEqual([21, 27]);
  });

  it("shows annual V27 before a previously dated rest on the same date", () => {
    const rest = {
      ...entry(),
      requestId: null,
      code: "WEEKLY_REST",
      label: "راحة أسبوعية",
    };
    const input = [rest, entry()];
    const result = enrichAnnualLeaveCalendar(input, [request]);
    expect(result.map((row) => row.label)).toEqual([
      "إجازة سنوية V27",
      "راحة أسبوعية",
    ]);
    expect(input.map((row) => row.label)).toEqual([
      "راحة أسبوعية",
      "إجازة سنوية",
    ]);
    expect(result).toHaveLength(2);
  });

  it("sorts dates first and retains source order among leaves or among rest and holidays", () => {
    const result = enrichAnnualLeaveCalendar(
      [
        { ...entry("2026-10-25"), code: "HOLIDAY", label: "عطلة" },
        { ...entry(), code: "WEEKLY_REST", label: "راحة" },
        { ...entry(), code: "SICK_LEAVE", label: "مرضية" },
        entry(),
        { ...entry(), code: "HOLIDAY", label: "رسمية" },
        {
          ...entry("2026-10-23"),
          code: "WEEKLY_REST",
          label: "راحة اليوم السابق",
        },
      ],
      [request],
    );
    expect(result.map((row) => row.label)).toEqual([
      "راحة اليوم السابق",
      "مرضية",
      "إجازة سنوية V27",
      "راحة",
      "رسمية",
      "عطلة",
    ]);
  });

  it("requires an approved matching annual request with complete original dates", () => {
    for (const changed of [
      { status: "pending" },
      { status: "cancelled" },
      { status: "rejected" },
      { leaveKind: "sick" },
      { workerId: 99 },
      { startDate: null },
      { startDate: "2026-02-31" },
      { endDate: null },
      { endDate: "2026-10-23" },
    ]) {
      expect(
        enrichAnnualLeaveCalendar([entry()], [{ ...request, ...changed }])[0],
      ).toEqual(entry());
    }
    expect(enrichAnnualLeaveCalendar([entry()], [])[0]).toEqual(entry());
    expect(
      enrichAnnualLeaveCalendar([{ ...entry(), requestId: null }], [request])[0]
        .label,
    ).toBe("إجازة سنوية");
    expect(
      enrichAnnualLeaveCalendar(
        [{ ...entry(), code: "SICK_LEAVE" }],
        [request],
      )[0].label,
    ).toBe("إجازة سنوية");
    expect(
      enrichAnnualLeaveCalendar([entry("2026-09-27")], [request])[0].label,
    ).toBe("إجازة سنوية");
  });

  it("accepts database Date values without local daylight-saving calculations", () => {
    expect(
      enrichAnnualLeaveCalendar(
        [{ ...entry(), date: new Date("2026-10-24T00:00:00Z") }],
        [
          {
            ...request,
            startDate: new Date("2026-09-28T00:00:00Z"),
            endDate: new Date("2026-11-03T00:00:00Z"),
          },
        ],
      )[0].annualLeaveDay,
    ).toBe(27);
    expect(annualLeaveDayNumber(new Date("bad"), "2026-09-28")).toBeUndefined();
    expect(annualLeaveDayNumber("2026-02-31", "2026-01-01")).toBeUndefined();
  });
});
