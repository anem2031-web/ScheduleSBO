import { describe, expect, it } from "vitest";
import { renderScheduleUpdatePng, renderWeeklySchedulePng, scheduleUpdateSvg, weeklyScheduleSvg } from "./whatsapp-images";

const days = [
  { day: "Sunday", date: "08/11/2026", lines: ["FROM 05:00 AM TO 10:00 AM", "FROM 06:00 PM TO 10:30 PM"] },
  { day: "Monday", date: "09/11/2026", lines: ["FROM 05:00 AM TO 10:00 AM", "FROM 06:00 PM TO 10:30 PM"] },
  { day: "Tuesday", date: "10/11/2026", lines: ["WEEKLY DAY OFF"] },
  { day: "Wednesday", date: "11/11/2026", lines: ["FROM 05:00 AM TO 02:30 PM"] },
  { day: "Thursday", date: "12/11/2026", lines: ["FROM 05:00 AM TO 02:30 PM"] },
  { day: "Friday", date: "13/11/2026", lines: ["FROM 05:00 AM TO 10:00 AM", "FROM 06:00 PM TO 10:30 PM"] },
  { day: "Saturday", date: "14/11/2026", lines: ["FROM 05:00 AM TO 02:30 PM"] },
];

describe("employee WhatsApp schedule images", () => {
  it("renders a complete weekly PNG including both shifts and a rest day", () => {
    const input = { workerName: "AHMED MOHAMED", days };
    const svg = weeklyScheduleSvg(input);
    expect(svg).toContain("SUNDAY");
    expect(svg).toContain("SATURDAY");
    expect(svg).toContain("WEEKLY DAY OFF");
    expect(svg).toContain("FROM 06:00 PM TO 10:30 PM");
    expect(svg).toContain("08/11/2026 - 14/11/2026");
    const png = renderWeeklySchedulePng(input);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(900);
    expect(png.readUInt32BE(20)).toBe(1800);
    expect(png.length).toBeGreaterThan(20_000);
  });

  it("renders a two-shift update image and supports Arabic names", () => {
    const input = { workerName: "أحمد محمد", day: "Friday", date: "2026-11-13", changeType: "Working hours changed", lines: ["FROM 05:30 AM TO 10:30 AM", "FROM 06:00 PM TO 10:30 PM"] };
    const svg = scheduleUpdateSvg(input);
    expect(svg).toContain("SHIFT 1");
    expect(svg).toContain("SHIFT 2");
    expect(svg).toContain("13/11/2026");
    const png = renderScheduleUpdatePng(input);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(900);
    expect(png.readUInt32BE(20)).toBe(1070);
    expect(png.length).toBeGreaterThan(15_000);
  });

  it("escapes names and does not allow markup in the rendered image", () => {
    const svg = scheduleUpdateSvg({ workerName: "Sam & <Test>", day: "Friday", date: "2026-11-13", changeType: "Changed", lines: ["DAY OFF"] });
    expect(svg).toContain("Sam &amp; &lt;Test&gt;");
    expect(svg).not.toContain("<Test>");
  });

  it("labels an updated day off as a schedule status rather than working hours", () => {
    const svg = scheduleUpdateSvg({ workerName: "AHMED", day: "Friday", date: "2026-11-13", changeType: "Day off changed", lines: ["WEEKLY DAY OFF"] });
    expect(svg).toContain("UPDATED SCHEDULE");
    expect(svg).toContain("DAY STATUS");
    expect(svg).toContain("WEEKLY DAY OFF");
    expect(svg).not.toContain("UPDATED WORKING HOURS");
  });

  it("rejects incomplete or inconsistent schedules instead of sending the wrong times", () => {
    expect(() => weeklyScheduleSvg({ workerName: "AHMED", days: days.slice(0, 6) })).toThrow();
    expect(() => weeklyScheduleSvg({ workerName: "AHMED", days: [{ ...days[0], day: "Monday" }, ...days.slice(1)] })).toThrow();
    expect(() => weeklyScheduleSvg({ workerName: "AHMED", days: [{ ...days[0], lines: ["a", "b", "c"] }, ...days.slice(1)] })).toThrow();
    expect(() => scheduleUpdateSvg({ workerName: "AHMED", day: "Friday", date: "2026-02-30", changeType: "Changed", lines: ["DAY OFF"] })).toThrow();
  });
});
