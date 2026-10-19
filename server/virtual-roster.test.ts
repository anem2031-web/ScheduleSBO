import { describe, expect, it } from "vitest";
import { calculateVirtualRosterRange } from "../client/src/components/schedules/useVirtualRoster";

describe("weekly roster virtual row ranges", () => {
  it("handles an empty roster without spacer rows", () => {
    expect(calculateVirtualRosterRange([], 0, 500)).toEqual({ startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 });
  });

  it("renders the first viewport plus overscan while preserving total table height", () => {
    const range = calculateVirtualRosterRange(Array(50).fill(220), 0, 500);
    expect(range).toEqual({ startIndex: 0, endIndex: 6, paddingTop: 0, paddingBottom: 44 * 220 });
    expect(range.paddingTop + (range.endIndex - range.startIndex) * 220 + range.paddingBottom).toBe(11000);
  });

  it("accounts for actual variable heights instead of a fixed row index", () => {
    const heights = [100, 400, 50, 900, 200, 100, 300];
    expect(calculateVirtualRosterRange(heights, 510, 1000, 0)).toEqual({ startIndex: 2, endIndex: 4, paddingTop: 500, paddingBottom: 600 });
  });

  it("keeps the last worker reachable at the bottom of a large page", () => {
    const range = calculateVirtualRosterRange(Array(50).fill(220), 10500, 11000);
    expect(range.endIndex).toBe(50);
    expect(range.paddingBottom).toBe(0);
    expect(range.startIndex).toBe(44);
  });

  it("clamps overscrolled positions and includes workers exactly at row boundaries", () => {
    expect(calculateVirtualRosterRange([100, 200, 300], 100, 300, 0)).toEqual({ startIndex: 1, endIndex: 2, paddingTop: 100, paddingBottom: 300 });
    expect(calculateVirtualRosterRange([100, 200, 300], 999, 1200, 0)).toEqual({ startIndex: 2, endIndex: 3, paddingTop: 300, paddingBottom: 0 });
  });

  it("expands the range when rows become shorter without losing middle rows", () => {
    const initial = calculateVirtualRosterRange(Array(20).fill(220), 0, 600, 0);
    const measured = calculateVirtualRosterRange(Array(20).fill(100), 0, 600, 0);
    expect(initial.endIndex).toBe(3);
    expect(measured.endIndex).toBe(6);
  });
});
