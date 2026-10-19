import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./users.repository", () => ({
  archiveSupervisor: vi.fn(),
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  getUsersByRole: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
}));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));

import { usersRouter } from "./users.router";
import {
  archiveSupervisor,
  getUserById,
  updateUserRole,
} from "./users.repository";
import { createAuditLog } from "../../shared/audit";

const caller = (role: "admin" | "hr_admin" | "supervisor") =>
  usersRouter.createCaller({ user: { id: 1, role } } as any);

describe("Account role administration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows the authorized admin to assign a validated role", async () => {
    await expect(
      caller("admin").updateRole({ userId: 2, newRole: "supervisor" }),
    ).resolves.toMatchObject({ success: true });
    expect(updateUserRole).toHaveBeenCalledWith(2, "supervisor");
  });

  it.each(["hr_admin", "supervisor"] as const)(
    "does not grant account administration to %s",
    async (role) => {
      await expect(
        caller(role).updateRole({ userId: 2, newRole: "admin" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(updateUserRole).not.toHaveBeenCalled();
    },
  );

  it("retains the guard against changing the current admin's own role", async () => {
    await expect(
      caller("admin").updateRole({ userId: 1, newRole: "worker" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateUserRole).not.toHaveBeenCalled();
  });
});

describe("Supervisor archival", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserById).mockResolvedValue({
      id: 2,
      role: "supervisor",
      isActive: true,
    } as any);
    vi.mocked(archiveSupervisor).mockResolvedValue(true);
  });

  it("archives an active supervisor and records the change", async () => {
    await expect(
      caller("admin").archiveSupervisor({ userId: 2 }),
    ).resolves.toMatchObject({ success: true });
    expect(archiveSupervisor).toHaveBeenCalledWith(2);
    expect(createAuditLog).toHaveBeenCalledWith(
      "users",
      2,
      "update",
      1,
      { isActive: true },
      { isActive: false },
      expect.stringContaining("أرشفة المشرف"),
    );
  });

  it.each(["hr_admin", "supervisor"] as const)(
    "denies account archival to %s",
    async (role) => {
      await expect(
        caller(role).archiveSupervisor({ userId: 2 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(getUserById).not.toHaveBeenCalled();
      expect(archiveSupervisor).not.toHaveBeenCalled();
    },
  );

  it("prevents self archival", async () => {
    await expect(
      caller("admin").archiveSupervisor({ userId: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(archiveSupervisor).not.toHaveBeenCalled();
  });

  it.each(["admin", "hr_admin", "worker"])(
    "does not archive a %s account through the supervisor action",
    async (role) => {
      vi.mocked(getUserById).mockResolvedValue({
        id: 2,
        role,
        isActive: true,
      } as any);
      await expect(
        caller("admin").archiveSupervisor({ userId: 2 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(archiveSupervisor).not.toHaveBeenCalled();
    },
  );

  it("reports a missing account", async () => {
    vi.mocked(getUserById).mockResolvedValue(undefined);
    await expect(
      caller("admin").archiveSupervisor({ userId: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(archiveSupervisor).not.toHaveBeenCalled();
  });

  it("treats an archived account as already complete", async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 2,
      role: "supervisor",
      isActive: false,
    } as any);
    await expect(
      caller("admin").archiveSupervisor({ userId: 2 }),
    ).resolves.toMatchObject({ success: true });
    expect(archiveSupervisor).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("does not report success when the role changed before the write", async () => {
    vi.mocked(archiveSupervisor).mockResolvedValue(false);
    await expect(
      caller("admin").archiveSupervisor({ userId: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
