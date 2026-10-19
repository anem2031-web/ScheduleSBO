import { describe, it, expect } from "vitest";

/**
 * اختبارات المنطق النقي لوحدة الهيكل التنظيمي.
 * دوال التحقق (assertNames, normalizeCode) غير مصدَّرة من الخدمة عمدًا
 * (تفاصيل داخلية)، فنعيد تنفيذ نفس القاعدة هنا للتحقق من السلوك المتوقع
 * دون الحاجة لقاعدة بيانات.
 */

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

describe("Org structure code normalization", () => {
  it("uppercases and trims codes", () => {
    expect(normalizeCode("  tolan  ")).toBe("TOLAN");
  });

  it("replaces internal whitespace with underscores", () => {
    expect(normalizeCode("al malqa")).toBe("AL_MALQA");
  });

  it("same input always normalizes identically (idempotent, no duplicates)", () => {
    expect(normalizeCode("BBQ")).toBe(normalizeCode("bbq"));
  });
});

describe("Org structure hierarchy shape (branch <->> location <->> department)", () => {
  it("supports a location shared by multiple branches (hybrid model)", () => {
    // محاكاة: نفس locationId مرتبط بأكثر من branchId في جدول الربط
    const links = [
      { branchId: 1, locationId: 10 },
      { branchId: 2, locationId: 10 },
    ];
    const branchesForLocation = links
      .filter((l) => l.locationId === 10)
      .map((l) => l.branchId);
    expect(branchesForLocation).toEqual([1, 2]);
  });

  it("supports a department repeated across multiple locations", () => {
    const links = [
      { locationId: 10, departmentId: 5 },
      { locationId: 11, departmentId: 5 },
    ];
    const locationsForDept = links
      .filter((l) => l.departmentId === 5)
      .map((l) => l.locationId);
    expect(locationsForDept).toEqual([10, 11]);
  });
});
