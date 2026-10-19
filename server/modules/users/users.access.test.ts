import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./users.repository", () => ({ getUserById: vi.fn(), getAllUsers: vi.fn(), getUsersByRole: vi.fn(), updateUserRole: vi.fn(), updateUserStatus: vi.fn(), archiveSupervisor: vi.fn() }));
vi.mock("./access.repository", () => ({ loadUserAccess: vi.fn(), getAccountRoleIds: vi.fn(), saveAccountAccess: vi.fn(), listAccessRoles: vi.fn(), assignAccessRoles: vi.fn() }));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));
import { usersRouter } from "./users.router";
import { getUserById } from "./users.repository";
import { loadUserAccess, saveAccountAccess } from "./access.repository";
import { createAuditLog } from "../../shared/audit";
const caller = (role: string, permissions?: string[]) => usersRouter.createCaller({ user: { id: 1, role, permissions } } as any);
describe("Safe delegation and revocation of account permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserById).mockResolvedValue({ id: 2, role: "hr_admin" } as any);
    vi.mocked(loadUserAccess).mockResolvedValue({ id: 2, role: "hr_admin", permissions: ["schedule:approve"], accessScope: null } as any);
  });
  it("allows admin to revoke all permissions without restoring HR defaults", async () => {
    await expect(caller("admin").setAccess({ userId: 2, permissions: [], scope: { costCenterIds: [] } })).resolves.toEqual({ success: true });
    expect(saveAccountAccess).toHaveBeenCalledWith({ userId: 2, permissions: [], scope: { costCenterIds: [] }, actorId: 1 });
    expect(createAuditLog).toHaveBeenCalled();
  });
  it.each(["hr_admin", "supervisor", "worker"])("does not let %s assign its own grants", async role => {
    await expect(caller(role, ["users:assign_role"]).setAccess({ userId: 2, permissions: ["users:assign_role"], scope: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(saveAccountAccess).not.toHaveBeenCalled();
  });
  it("protects admin bootstrap from grant restrictions", async () => {
    vi.mocked(getUserById).mockResolvedValue({ id: 2, role: "admin" } as any);
    await expect(caller("admin").setAccess({ userId: 2, permissions: [], scope: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("does not expose another account's grants to HR", async () => {
    await expect(caller("hr_admin").accessSettings({ userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getUserById).not.toHaveBeenCalled();
  });
  it("uses current effective grants in the user's permission view", async () => {
    await expect(caller("hr_admin", ["schedule:read"]).getMyPermissions()).resolves.toEqual(["schedule:read"]);
  });
});
