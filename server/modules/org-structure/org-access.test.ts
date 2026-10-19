import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
import { getDb } from "../../shared/db";
import { branchLocations, jobTitles, locationDepartments } from "../../../drizzle/schema";
import { assertOrgLinkScope, assertOrgScope, orgScope } from "./org-access";
const user = { id: 2, role: "hr_admin", accessScope: { costCenterIds: [1] } };
describe("Organization access does not leak shared centers", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: (table: unknown) => Promise.resolve(table === branchLocations ? [{ id: 1, branchId: 1, locationId: 10 }, { id: 2, branchId: 2, locationId: 20 }, { id: 3, branchId: 1, locationId: 30 }, { id: 4, branchId: 2, locationId: 30 }] : table === locationDepartments ? [{ id: 1, locationId: 10, departmentId: 100 }, { id: 2, locationId: 20, departmentId: 200 }, { id: 3, locationId: 30, departmentId: 300 }] : table === jobTitles ? [{ id: 1, departmentId: 100 }, { id: 2, departmentId: 200 }] : []) }) } as any);
  });
  it("filters reads to linked locations, departments, and titles", async () => {
    expect(await orgScope(user)).toMatchObject({ locations: [10, 30], departments: [100, 300], jobTitles: [1] });
  });
  it("does not allow changes to shared locations affecting another center", async () => {
    await expect(assertOrgScope(user, "locations", 30)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertOrgScope(user, "locations", 10)).resolves.toBeUndefined();
  });
  it("does not allow unscoped catalog creation or another center's links", async () => {
    await expect(assertOrgScope(user, "locations")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertOrgLinkScope(user, "branch", 2)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertOrgLinkScope(user, "branch", 1)).resolves.toBeUndefined();
  });
  it("retains unrestricted bootstrap setup", async () => {
    await expect(orgScope({ id: 1, role: "admin" })).resolves.toBeUndefined();
  });
});
