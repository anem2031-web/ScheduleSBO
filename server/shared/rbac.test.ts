import { describe, it, expect } from "vitest";
import * as rbac from "./rbac";
import type { User } from "../../drizzle/schema";

describe("RBAC System", () => {
  const createUser = (role: User["role"]): User => ({
    id: 1,
    openId: "test",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "local",
    passwordHash: "hash",
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  describe("Admin Role", () => {
    const admin = createUser("admin");

    it("should have all permissions", () => {
      expect(rbac.hasPermission(admin, "users:read")).toBe(true);
      expect(rbac.hasPermission(admin, "users:delete")).toBe(true);
      expect(rbac.hasPermission(admin, "settings:update")).toBe(true);
      expect(rbac.hasPermission(admin, "anything:else")).toBe(true);
    });
  });

  describe("HR Admin Role", () => {
    const hrAdmin = createUser("hr_admin");

    it("should have HR permissions", () => {
      expect(rbac.hasPermission(hrAdmin, "workers:read")).toBe(true);
      expect(rbac.hasPermission(hrAdmin, "workers:create")).toBe(true);
      expect(rbac.hasPermission(hrAdmin, "evaluations:create")).toBe(true);
    });

    it("should not have admin permissions", () => {
      expect(rbac.hasPermission(hrAdmin, "users:delete")).toBe(false);
      expect(rbac.hasPermission(hrAdmin, "settings:update")).toBe(false);
    });
  });

  describe("Supervisor Role", () => {
    const supervisor = createUser("supervisor");

    it("should have supervisor permissions", () => {
      expect(rbac.hasPermission(supervisor, "attendance:record")).toBe(true);
      expect(rbac.hasPermission(supervisor, "requests:approve")).toBe(true);
    });

    it("should not have HR permissions", () => {
      expect(rbac.hasPermission(supervisor, "workers:delete")).toBe(false);
      expect(rbac.hasPermission(supervisor, "evaluations:update")).toBe(false);
    });
  });

  describe("Worker Role", () => {
    const worker = createUser("worker");

    it("should have limited permissions", () => {
      expect(rbac.hasPermission(worker, "workers:read:self")).toBe(true);
      expect(rbac.hasPermission(worker, "requests:create")).toBe(true);
    });

    it("should not have write permissions", () => {
      expect(rbac.hasPermission(worker, "workers:update")).toBe(false);
      expect(rbac.hasPermission(worker, "attendance:record")).toBe(false);
    });
  });

  describe("Finance Roles", () => {
    it("financial_reviewer should have review permissions", () => {
      const reviewer = createUser("financial_reviewer");
      expect(rbac.hasPermission(reviewer, "payroll:review")).toBe(true);
      expect(rbac.hasPermission(reviewer, "payroll:approve")).toBe(false);
    });

    it("finance should have approve permissions", () => {
      const finance = createUser("finance");
      expect(rbac.hasPermission(finance, "payroll:approve")).toBe(true);
      expect(rbac.hasPermission(finance, "payroll:execute")).toBe(false);
    });

    it("accounting_head should have execute permissions", () => {
      const head = createUser("accounting_head");
      expect(rbac.hasPermission(head, "payroll:execute")).toBe(true);
    });
  });

  describe("Worker Access Control", () => {
    const admin = createUser("admin");
    const worker = createUser("worker");

    it("admin should access any worker", () => {
      expect(rbac.canAccessWorker(admin, 999, 1)).toBe(true);
    });

    it("worker should access own data only", () => {
      expect(rbac.canAccessWorker(worker, 1, 1)).toBe(true);
      expect(rbac.canAccessWorker(worker, 2, 1)).toBe(false);
    });
  });

  describe("Permission Enforcement", () => {
    const admin = createUser("admin");
    const worker = createUser("worker");

    it("should not throw for allowed permission", () => {
      expect(() => rbac.requirePermission(admin, "users:delete")).not.toThrow();
    });

    it("should throw for denied permission", () => {
      expect(() => rbac.requirePermission(worker, "users:delete")).toThrow();
    });
  });
});

describe("Permission naming consistency (S0 regression)", () => {
  const createUser = (role: any) => ({ role } as any);

  it("legacy dot-constants resolve to colon format", () => {
    expect(rbac.ATTENDANCE_RECORD).toBe("attendance:record");
    expect(rbac.ATTENDANCE_READ).toBe("attendance:read");
    expect(rbac.EVALUATION_READ).toBe("evaluation:read");
    expect(rbac.INCENTIVE_READ).toBe("incentive:read");
    expect(rbac.USERS_CREATE).toBe("users:create");
  });

  it("no permission string uses dot separator anywhere", () => {
    const all = Object.values(rbac).filter((v) => typeof v === "string") as string[];
    for (const p of all) {
      if (p.includes(":") || p === "*") continue;
      expect(p.includes(".")).toBe(false);
    }
    for (const perms of Object.values(rbac.ROLE_PERMISSIONS)) {
      for (const p of perms) expect(p.includes(".")).toBe(false);
    }
  });

  it("guard can record attendance via router constant", () => {
    expect(rbac.hasPermission("guard", rbac.ATTENDANCE_RECORD)).toBe(true);
  });

  it("hr_admin can read and create schedules via router constants", () => {
    expect(rbac.hasPermission("hr_admin", rbac.SCHEDULE_READ)).toBe(true);
    expect(rbac.hasPermission("hr_admin", rbac.SCHEDULE_CREATE)).toBe(true);
    expect(rbac.hasPermission("hr_admin", rbac.SCHEDULE_APPROVE)).toBe(true);
  });

  it("supervisor can read but not lock schedules", () => {
    expect(rbac.hasPermission("supervisor", rbac.SCHEDULE_READ)).toBe(true);
    expect(rbac.hasPermission("supervisor", rbac.SCHEDULE_LOCK)).toBe(false);
  });

  it("no plural schedules:* entries remain in role maps", () => {
    for (const perms of Object.values(rbac.ROLE_PERMISSIONS)) {
      for (const p of perms) expect(p.startsWith("schedules:")).toBe(false);
    }
  });
});
