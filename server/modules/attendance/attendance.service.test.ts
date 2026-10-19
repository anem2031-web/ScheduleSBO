import { describe, expect, it } from "vitest";
import {
  calculateLateMinutes,
  calculateOvertimeMinutes,
  getDateOnly,
} from "./attendance.service";

/**
 * اختبارات وحدة لمنطق العمل الصافي — لا تحتاج قاعدة بيانات ولا tRPC.
 * هذه هي الفائدة المباشرة من فصل الـ Service عن الـ Router.
 */

describe("attendance.service — pure helpers", () => {
  describe("getDateOnly", () => {
    it("strips the time component", () => {
      const d = new Date(2026, 6, 17, 14, 35, 22, 500);
      const result = getDateOnly(d);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(6);
      expect(result.getDate()).toBe(17);
    });

    it("does not mutate the original date", () => {
      const d = new Date(2026, 6, 17, 14, 35);
      getDateOnly(d);
      expect(d.getHours()).toBe(14);
    });
  });

  describe("calculateLateMinutes", () => {
    it("returns 0 when checking in before shift start", () => {
      const checkIn = new Date(2026, 6, 17, 7, 45);
      expect(calculateLateMinutes(checkIn, "08:00")).toBe(0);
    });

    it("returns 0 when checking in exactly on time", () => {
      const checkIn = new Date(2026, 6, 17, 8, 0);
      expect(calculateLateMinutes(checkIn, "08:00")).toBe(0);
    });

    it("returns late minutes when checking in after shift start", () => {
      const checkIn = new Date(2026, 6, 17, 8, 25);
      expect(calculateLateMinutes(checkIn, "08:00")).toBe(25);
    });
  });

  describe("calculateOvertimeMinutes", () => {
    it("returns 0 when leaving before shift end", () => {
      const checkOut = new Date(2026, 6, 17, 16, 30);
      expect(calculateOvertimeMinutes(checkOut, "17:00")).toBe(0);
    });

    it("returns overtime minutes when leaving after shift end", () => {
      const checkOut = new Date(2026, 6, 17, 18, 15);
      expect(calculateOvertimeMinutes(checkOut, "17:00")).toBe(75);
    });
  });
});
