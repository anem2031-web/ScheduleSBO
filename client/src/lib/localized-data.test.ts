import { describe, expect, it } from "vitest";
import { localizedJobTitle, localizedName } from "./localized-data";

describe("localized data names", () => {
  const worker = { nameAr: "أحمد", nameEn: "Ahmed", nameUr: "احمد" };
  it("displays the stored name for the viewer's language", () => {
    expect(localizedName(worker, "ar")).toBe("أحمد");
    expect(localizedName(worker, "en")).toBe("Ahmed");
    expect(localizedName(worker, "ur")).toBe("احمد");
  });
  it("preserves the original when a translation is missing or blank", () => {
    expect(localizedName({ nameAr: "تولان", nameEn: " " }, "en")).toBe("تولان");
    expect(localizedName({ nameEn: "Ahmed" }, "ur")).toBe("Ahmed");
  });
  it("uses the matching job title instead of always using Arabic", () => {
    expect(localizedJobTitle({ titleAr: "مشرف", titleEn: "Supervisor" }, "en")).toBe("Supervisor");
  });
});
