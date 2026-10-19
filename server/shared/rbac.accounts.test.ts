import { describe, expect, it } from "vitest";
import { effectivePermissions, hasPermission, isCostCenterAllowed, requireCostCenter } from "./rbac";

describe("Account-level grants and cost-center scopes", () => {
  it("replaces broad HR defaults when explicit grants exist", () => {
    const user = { role: "hr_admin", permissions: ["schedule:read", "leave:approve"] } as const;
    expect(hasPermission({ ...user, permissions: [...user.permissions] }, "leave:approve")).toBe(true);
    expect(hasPermission({ ...user, permissions: [...user.permissions] }, "workers:update")).toBe(false);
  });
  it("denies all actions for an explicitly empty role", () => {
    expect(effectivePermissions({ role: "hr_admin", permissions: [] })).toEqual([]);
    expect(hasPermission({ role: "hr_admin", permissions: [] }, "schedule:read")).toBe(false);
  });
  it("keeps the bootstrap admin unrestricted", () => {
    expect(hasPermission({ role: "admin", permissions: [] }, "anything:manage")).toBe(true);
    expect(isCostCenterAllowed({ role: "admin", accessScope: { costCenterIds: [] } }, 1)).toBe(true);
  });
  it("retains defaults for legacy principals without custom memberships", () => {
    expect(hasPermission({ role: "hr_admin" }, "schedule:create")).toBe(true);
    expect(hasPermission("supervisor", "schedule:create")).toBe(true);
  });
  it("isolates an HR account to its allowed centers", () => {
    const user = { role: "hr_admin", accessScope: { costCenterIds: [2, 3] } } as const;
    const principal = { ...user, accessScope: { costCenterIds: [...user.accessScope.costCenterIds] } };
    expect(isCostCenterAllowed(principal, 2)).toBe(true);
    expect(isCostCenterAllowed(principal, 1)).toBe(false);
    expect(isCostCenterAllowed(principal, null)).toBe(false);
    expect(() => requireCostCenter(principal, 1)).toThrow("خارج نطاق");
  });
  it("treats an empty center list as no access, and null as unrestricted", () => {
    expect(isCostCenterAllowed({ role: "hr_admin", accessScope: { costCenterIds: [] } }, 1)).toBe(false);
    expect(isCostCenterAllowed({ role: "hr_admin", accessScope: null }, 1)).toBe(true);
  });
  it("does not infer worker permissions from unrelated identifiers", () => {
    expect(hasPermission({ role: "worker", permissions: ["workers:read:self"] }, "workers:read")).toBe(false);
  });
});
