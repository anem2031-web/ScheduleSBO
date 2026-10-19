import { describe, expect, it } from "vitest";
import {
  operationalDate,
  operationalDayBounds,
} from "../../../shared/operational-day";
import {
  assertOperationalInterval,
  directIntervalMinutes,
  intervalWorkMinutes,
  intervalOverlapMinutes,
} from "../../../shared/weekly-schedule";
import { findConflict } from "./assignments.conflict";

describe("400-worker trial operational time and separate breaks", () => {
  it("assigns every second around 04:30 to exactly one operational day", () => {
    expect(operationalDate("2026-10-18T04:29:59.999+03:00")).toBe("2026-10-17");
    expect(operationalDate("2026-10-18T04:30:00+03:00")).toBe("2026-10-18");
    expect(operationalDate("2026-10-19T01:30:00+03:00")).toBe("2026-10-18");
    const a = operationalDayBounds("2026-10-18"),
      b = operationalDayBounds("2026-10-19");
    expect(a.endExclusive.getTime()).toBe(b.start.getTime());
    expect(a.endExclusive.getTime() - a.start.getTime()).toBe(86400000);
  });
  it.each([
    ["15:30", "01:00"],
    ["16:00", "01:30"],
    ["05:00", "14:30"],
  ])(
    "counts %s–%s as 9 work hours and a separate half hour",
    (startTime, endTime) => {
      const shift = { startTime, endTime, breakMinutes: 30 };
      expect(directIntervalMinutes(shift)).toBe(570);
      expect(intervalWorkMinutes(shift)).toBe(540);
      expect(() => assertOperationalInterval(shift)).not.toThrow();
    },
  );
  it("counts 5 morning hours plus 4 evening work hours with one break and an 8-hour admin day", () => {
    expect(
      intervalWorkMinutes({ startTime: "05:00", endTime: "10:00" }) +
        intervalWorkMinutes({
          startTime: "16:00",
          endTime: "20:30",
          breakMinutes: 30,
        }),
    ).toBe(540);
    expect(
      intervalWorkMinutes({
        startTime: "08:30",
        endTime: "17:00",
        breakMinutes: 30,
      }),
    ).toBe(480);
  });
  it("accepts the final operational minute and rejects work crossing the next boundary", () => {
    expect(() =>
      assertOperationalInterval({ startTime: "01:00", endTime: "04:30" }),
    ).not.toThrow();
    expect(() =>
      assertOperationalInterval({ startTime: "01:00", endTime: "04:31" }),
    ).toThrow("04:30");
    expect(() =>
      assertOperationalInterval({ startTime: "03:00", endTime: "06:00" }),
    ).toThrow();
  });
  it("detects overlap after midnight on the same operational day", () => {
    expect(
      findConflict(
        {
          workDate: "2026-10-18",
          startTime: "01:00",
          endTime: "02:00",
          crossesMidnight: false,
        },
        [
          {
            id: 1,
            workDate: "2026-10-18",
            startTime: "16:00",
            endTime: "01:30",
            crossesMidnight: true,
          },
        ],
      )?.id,
    ).toBe(1);
    expect(
      findConflict(
        {
          workDate: "2026-10-19",
          startTime: "05:00",
          endTime: "10:00",
          crossesMidnight: false,
        },
        [
          {
            id: 1,
            workDate: "2026-10-18",
            startTime: "16:00",
            endTime: "01:30",
            crossesMidnight: true,
          },
        ],
      ),
    ).toBeNull();
  });
  it("deducts only permission minutes that overlap an interval, including midnight", () => {
    expect(
      intervalOverlapMinutes({ startTime: "16:00", endTime: "01:30" }, [
        { startTime: "00:30", endTime: "01:00" },
      ]),
    ).toBe(30);
    expect(
      intervalOverlapMinutes({ startTime: "05:00", endTime: "10:00" }, [
        { startTime: "00:30", endTime: "01:00" },
      ]),
    ).toBe(0);
    expect(() =>
      intervalWorkMinutes({
        startTime: "16:00",
        endTime: "01:30",
        breakMinutes: 15,
      }),
    ).toThrow();
  });
});
