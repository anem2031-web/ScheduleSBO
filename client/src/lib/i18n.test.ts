import { describe, expect, it } from "vitest";
import { t, translations } from "./i18n";

describe("interface translations", () => {
  it("reads the flat dictionary keys in all supported interface languages", () => {
    expect(t("nav.dashboard", "ar")).toBe("لوحة التحكم");
    expect(t("nav.dashboard", "en")).toBe("Dashboard");
    expect(t("nav.dashboard", "ur")).toBe("ڈیش بورڈ");
  });

  it("keeps an unknown key visible and maintains complete dictionary entries", () => {
    expect(t("not.a.real.key", "en")).toBe("not.a.real.key");
    for (const [key, entry] of Object.entries(translations)) {
      expect(entry.ar, `${key} is missing Arabic`).toBeTruthy();
      expect(entry.en, `${key} is missing English`).toBeTruthy();
      expect(entry.ur, `${key} is missing Urdu`).toBeTruthy();
    }
  });
});
