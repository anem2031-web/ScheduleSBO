import { describe, expect, it } from "vitest";
import {
  displayLanguage,
  formatDateTime,
  formatNumber,
  normalizeDigits,
} from "../shared/display-format";

const easternDigits = /[\u0660-\u0669\u06f0-\u06f9\u066b\u066c]/;

describe("Western numeric presentation", () => {
  it.each([
    "ar-SA",
    "en-US",
    "ur-PK",
    "fa-IR",
    "ar-EG-u-nu-arab",
    "de-DE",
    "fr-FR",
  ])("always uses Western digits and a decimal point for %s", (locale) => {
    const result = formatNumber(1234.5, { maximumFractionDigits: 2 }, locale);
    expect(result).not.toMatch(easternDigits);
    expect(result).toContain("1,234.5");
  });
  it("overrides explicit alternative numbering systems and keeps zero, fractions and sign", () => {
    expect(formatNumber(9.5, { numberingSystem: "arab" }, "ar-SA")).toBe("9.5");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-0.5)).toBe("-0.5");
    expect(formatNumber(7n)).toBe("7");
    expect(formatNumber(1.25, { minimumFractionDigits: 3 })).toBe("1.250");
  });
  it("retains local unit/currency words without localizing the digits", () => {
    const result = formatNumber(
      9.5,
      { style: "currency", currency: "SAR" },
      "ar-SA",
    );
    expect(result).toContain("9.50");
    expect(result).toMatch(/[ر|س]/);
    expect(result).not.toMatch(easternDigits);
  });
  it("normalizes Arabic and Persian digits in display text without changing other letters", () => {
    const source = "الموقع ١۲٣ · الرصيد ٩٫۵ و ١٬٠٠٠";
    expect(normalizeDigits(source)).toBe("الموقع 123 · الرصيد 9.5 و 1,000");
    expect(source).toBe("الموقع ١۲٣ · الرصيد ٩٫۵ و ١٬٠٠٠");
    expect(normalizeDigits("قسم التشغيل / Maintenance")).toBe(
      "قسم التشغيل / Maintenance",
    );
  });
  it.each(["ar-SA", "en-GB", "ur-PK", "fa-IR"])(
    "keeps time zone and calendar choices while showing Western dates for %s",
    (locale) => {
      const date = new Date("2026-10-17T22:30:00Z");
      const result = formatDateTime(
        date,
        {
          timeZone: "Asia/Riyadh",
          calendar: "gregory",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
        locale,
      );
      expect(result).not.toMatch(easternDigits);
      expect(result).toContain("2026");
      expect(result).toContain("18");
      expect(result).toContain("01:30");
      expect(date.toISOString()).toBe("2026-10-17T22:30:00.000Z");
    },
  );
  it("preserves an explicitly requested Islamic calendar and Arabic month labels", () => {
    const options: Intl.DateTimeFormatOptions = {
      calendar: "islamic",
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const date = new Date("2026-10-18T12:00:00Z");
    const expected = new Intl.DateTimeFormat("ar-SA", {
      ...options,
      numberingSystem: "latn",
    }).format(date);
    expect(formatDateTime(date, options, "ar-SA")).toBe(expected);
    expect(formatDateTime(date, options, "ar-SA")).toMatch(/[\u0621-\u064a]/);
  });
  it("carries the numeric preference with a language switch while keeping calendar extensions", () => {
    for (const locale of ["ar", "en", "ur"])
      expect(displayLanguage(locale)).toBe(locale + "-u-nu-latn");
    expect(displayLanguage("ar-SA-u-ca-islamic-nu-arab")).toBe(
      "ar-SA-u-ca-islamic-nu-latn",
    );
  });
});
