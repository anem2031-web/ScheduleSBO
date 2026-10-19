import { describe, expect, it } from "vitest";
import { authorizedDestinations, destinationLabels, primaryDestination, resolveDestination, resolveStoredDestination, validateWorkDestination, type DestinationCatalog } from "./work-destination";
const catalog = {
  centers: [{ id: 1, code: "OFFICE", nameAr: "المكتب", isActive: true }, { id: 2, code: "FOOD", nameAr: "المطاعم", isActive: true }],
  locations: [{ id: 11, nameAr: "الإدارة", isActive: true }, { id: 12, nameAr: "المطعم", isActive: true }],
  departments: [{ id: 21, nameAr: "الضيافة", isActive: true }, { id: 22, nameAr: "الخدمة", isActive: true }],
  jobTitles: [{ id: 31, titleAr: "بوفيه", departmentId: 21, effectiveFrom: "2020-01-01", effectiveTo: null, isActive: true }, { id: 32, titleAr: "كاشير", departmentId: 22, effectiveFrom: "2020-01-01", effectiveTo: null, isActive: true }],
  branchLocations: [{ branchId: 1, locationId: 11 }, { branchId: 2, locationId: 12 }],
  locationDepartments: [{ locationId: 11, departmentId: 21 }, { locationId: 12, departmentId: 22 }],
} as unknown as DestinationCatalog;
const primary = { costCenterId: 1, locationId: 11, departmentId: 21, jobTitleId: 31 };
const evening = { costCenterId: 2, locationId: 12, departmentId: 22, jobTitleId: 32 };
const admin = { role: "admin" };
describe("per-period destination validation", () => {
  it("defaults each omitted interval destination to its worker rather than another worker", () => {
    const worker = { id: 7, departmentId: 21, locationId: null, jobTitleId: 31 };
    expect(primaryDestination(worker, "OFFICE", catalog)).toEqual(primary);
    expect(resolveDestination({}, primary)).toEqual(primary);
    expect(resolveDestination(evening, primary)).toEqual(evening);
  });
  it("keeps one worker's office buffet and restaurant cashier jobs distinct", () => {
    expect(validateWorkDestination(admin, {}, primary, catalog, "2026-10-18")).toEqual(primary);
    expect(validateWorkDestination(admin, evening, primary, catalog, "2026-10-18")).toEqual(evening);
    expect(destinationLabels(evening, catalog)).toMatchObject({ costCenter: "المطاعم", locationName: "المطعم", departmentName: "الخدمة", jobTitleName: "كاشير" });
  });
  it("allows an authorized destination even if the worker primary is elsewhere and denies another center", () => {
    const actor = { role: "supervisor", accessScope: { costCenterIds: [2] } };
    expect(validateWorkDestination(actor, evening, primary, catalog, "2026-10-18")).toEqual(evening);
    expect(() => validateWorkDestination(actor, {}, primary, catalog, "2026-10-18")).toThrow(/خارج مراكز التكلفة/);
    expect(() => validateWorkDestination({ role: "supervisor", accessScope: { costCenterIds: [] } }, evening, primary, catalog, "2026-10-18")).toThrow();
  });
  it.each([
    [{ ...evening, locationId: 11 }, /الموقع غير مرتبط/],
    [{ ...evening, departmentId: 21 }, /القسم غير مرتبط/],
    [{ ...evening, jobTitleId: 31 }, /المهمة غير مرتبطة/],
    [{ ...evening, jobTitleId: 999 }, /مهمة نشطة/],
    [{ ...evening, costCenterId: 0 }, /جهة عمل صحيحة/],
  ])("rejects mismatched or missing hierarchy %#", (interval, message) => {
    expect(() => validateWorkDestination(admin, interval, primary, catalog, "2026-10-18")).toThrow(message);
  });
  it("drops an incompatible inherited task and permits no task without inventing one", () => {
    expect(validateWorkDestination(admin, { costCenterId: 2, locationId: 12, departmentId: 22 }, primary, catalog, "2026-10-18")).toEqual({ ...evening, jobTitleId: null });
    expect(validateWorkDestination(admin, {}, { ...primary, jobTitleId: null }, catalog, "2026-10-18").jobTitleId).toBeNull();
  });
  it("preserves an explicitly empty task through a stored read and resave in either department", () => {
    for (const destination of [primary, evening]) {
      const saved = { ...destination, jobTitleId: null };
      const read = resolveStoredDestination(saved, primary);
      expect(read.jobTitleId).toBeNull();
      expect(validateWorkDestination(admin, read, primary, catalog, "2026-10-18").jobTitleId).toBeNull();
      expect(validateWorkDestination(admin, { ...destination, jobTitleId: null }, primary, catalog, "2026-10-18").jobTitleId).toBeNull();
    }
    expect(resolveStoredDestination({ costCenterId: null, locationId: null, departmentId: 21, jobTitleId: null }, primary).jobTitleId).toBe(31);
  });
  it("rejects inactive and expired tasks or sites", () => {
    for (const changed of [
      { ...catalog, locations: catalog.locations.map((row) => ({ ...row, isActive: false })) },
      { ...catalog, jobTitles: catalog.jobTitles.map((row) => ({ ...row, effectiveTo: new Date("2026-10-17T00:00:00Z") })) },
    ]) expect(() => validateWorkDestination(admin, evening, primary, changed, "2026-10-18")).toThrow();
  });
  it("returns only authorized active hierarchies in picker catalogs", () => {
    const result = authorizedDestinations({ role: "hr_admin", accessScope: { costCenterIds: [2] } }, catalog);
    expect(result.centers.map((row) => row.id)).toEqual([2]); expect(result.locations.map((row) => row.id)).toEqual([12]); expect(result.departments.map((row) => row.id)).toEqual([22]); expect(result.jobTitles.map((row) => row.id)).toEqual([32]);
    expect(authorizedDestinations({ role: "hr_admin", accessScope: { costCenterIds: [] } }, catalog).centers).toEqual([]);
  });
});
