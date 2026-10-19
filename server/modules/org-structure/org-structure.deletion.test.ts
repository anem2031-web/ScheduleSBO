import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./org-structure.repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./org-structure.repository")>();
  return {
    ...actual,
    findBranchById: vi.fn(),
    findLocationById: vi.fn(),
    findDepartmentById: vi.fn(),
    findBranchLocationLink: vi.fn(),
    findLocationDepartmentLink: vi.fn(),
    countBranchLocationLinksByBranch: vi.fn(),
    countWorkersByBranch: vi.fn(),
    countBranchLocationLinksByLocation: vi.fn(),
    countLocationDepartmentLinksByLocation: vi.fn(),
    countLocationDepartmentLinksByDepartment: vi.fn(),
    countWorkersByDepartment: vi.fn(),
    countJobTitlesByDepartment: vi.fn(),
    countDepartmentRecords: vi.fn(),
    deleteBranch: vi.fn(),
    deleteLocation: vi.fn(),
    deleteDepartment: vi.fn(),
  };
});
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));

import * as repo from "./org-structure.repository";
import * as service from "./org-structure.service";
import { orgStructureRouter } from "./org-structure.router";
import { createAuditLog } from "../../shared/audit";

const branch = { id: 3, code: "PARK", nameAr: "الحديقة", isActive: true };
const location = { id: 10, code: "GATE", nameAr: "البوابة", isActive: true };
const department = { id: 20, code: "OPS", nameAr: "التشغيل", isActive: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repo.findBranchById).mockResolvedValue(branch as any);
  vi.mocked(repo.findLocationById).mockResolvedValue(location as any);
  vi.mocked(repo.findDepartmentById).mockResolvedValue(department as any);
  vi.mocked(repo.countBranchLocationLinksByBranch).mockResolvedValue(0);
  vi.mocked(repo.countWorkersByBranch).mockResolvedValue(0);
  vi.mocked(repo.countBranchLocationLinksByLocation).mockResolvedValue(0);
  vi.mocked(repo.countLocationDepartmentLinksByLocation).mockResolvedValue(0);
  vi.mocked(repo.countLocationDepartmentLinksByDepartment).mockResolvedValue(0);
  vi.mocked(repo.countWorkersByDepartment).mockResolvedValue(0);
  vi.mocked(repo.countJobTitlesByDepartment).mockResolvedValue(0);
  vi.mocked(repo.countDepartmentRecords).mockResolvedValue(0);
  vi.mocked(repo.findBranchLocationLink).mockResolvedValue(null);
  vi.mocked(repo.findLocationDepartmentLink).mockResolvedValue(null);
});

describe("Organization deletion preserves references", () => {
  it("blocks deleting a cost center containing sites", async () => {
    vi.mocked(repo.countBranchLocationLinksByBranch).mockResolvedValue(1);
    await expect(
      service.deleteBranch({ branchId: 3, deletedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.deleteBranch).not.toHaveBeenCalled();
  });

  it("blocks cost-center deletion when worker settings still use its legacy identifier", async () => {
    vi.mocked(repo.countWorkersByBranch).mockResolvedValue(2);
    await expect(
      service.deleteBranch({ branchId: 3, deletedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.countWorkersByBranch).toHaveBeenCalledWith(branch);
    expect(repo.deleteBranch).not.toHaveBeenCalled();
  });

  it("allows an unused cost center and audits only the deleted center", async () => {
    await expect(
      service.deleteBranch({ branchId: 3, deletedBy: 1 }),
    ).resolves.toEqual({ removed: true });
    expect(repo.deleteBranch).toHaveBeenCalledWith(branch);
    expect(createAuditLog).toHaveBeenCalledWith("branch", 3, "delete", 1, {
      code: "PARK",
      nameAr: "الحديقة",
    });
  });

  it("permits deleting an empty site together with its explicitly selected sole parent link", async () => {
    vi.mocked(repo.countBranchLocationLinksByLocation).mockResolvedValue(1);
    vi.mocked(repo.findBranchLocationLink).mockResolvedValue({
      id: 30,
      branchId: 3,
      locationId: 10,
    } as any);
    await service.deleteLocation({
      locationId: 10,
      contextBranchId: 3,
      deletedBy: 1,
    });
    expect(repo.deleteLocation).toHaveBeenCalledWith(10, 3);
  });

  it("blocks deleting a shared site from one of its cost centers", async () => {
    vi.mocked(repo.countBranchLocationLinksByLocation).mockResolvedValue(2);
    vi.mocked(repo.findBranchLocationLink).mockResolvedValue({ id: 30 } as any);
    await expect(
      service.deleteLocation({
        locationId: 10,
        contextBranchId: 3,
        deletedBy: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.deleteLocation).not.toHaveBeenCalled();
  });

  it("blocks a site containing departments even if its only parent is the current center", async () => {
    vi.mocked(repo.countLocationDepartmentLinksByLocation).mockResolvedValue(1);
    await expect(
      service.deleteLocation({
        locationId: 10,
        contextBranchId: 3,
        deletedBy: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.deleteLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["workers", "countWorkersByDepartment"],
    ["job titles", "countJobTitlesByDepartment"],
    ["historical records", "countDepartmentRecords"],
  ] as const)("blocks a department with %s", async (_, counter) => {
    vi.mocked(repo[counter]).mockResolvedValue(1);
    await expect(
      service.deleteDepartment({ departmentId: 20, deletedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.deleteDepartment).not.toHaveBeenCalled();
  });

  it("blocks deleting a department shared by another location", async () => {
    vi.mocked(repo.countLocationDepartmentLinksByDepartment).mockResolvedValue(
      2,
    );
    vi.mocked(repo.findLocationDepartmentLink).mockResolvedValue({
      id: 40,
    } as any);
    await expect(
      service.deleteDepartment({
        departmentId: 20,
        contextLocationId: 10,
        deletedBy: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.deleteDepartment).not.toHaveBeenCalled();
  });

  it("permits deleting an unused department and its confirmed sole context link", async () => {
    vi.mocked(repo.countLocationDepartmentLinksByDepartment).mockResolvedValue(
      1,
    );
    vi.mocked(repo.findLocationDepartmentLink).mockResolvedValue({
      id: 40,
    } as any);
    await service.deleteDepartment({
      departmentId: 20,
      contextLocationId: 10,
      deletedBy: 1,
    });
    expect(repo.deleteDepartment).toHaveBeenCalledWith(20, 10);
  });

  it("does not audit a failed final dependency check", async () => {
    vi.mocked(repo.deleteDepartment).mockRejectedValue(
      new repo.OrgDeletionConflict(),
    );
    await expect(
      service.deleteDepartment({ departmentId: 20, deletedBy: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("reports missing entities without deleting anything", async () => {
    vi.mocked(repo.findDepartmentById).mockResolvedValue(null);
    await expect(
      service.deleteDepartment({ departmentId: 20, deletedBy: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.deleteDepartment).not.toHaveBeenCalled();
  });
});

describe("Organization deletion permissions", () => {
  const callerFor = (role: string | null) =>
    orgStructureRouter.createCaller({
      user: role ? { id: 7, role } : null,
      req: {},
      res: {},
    } as any);

  it.each(["supervisor", "worker", "guard", "finance", "modifier"])(
    "denies all deletion endpoints to %s",
    async (role) => {
      const caller = callerFor(role);
      await expect(caller.deleteBranch({ branchId: 3 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.deleteLocation({ locationId: 10, contextBranchId: 3 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.deleteDepartment({ departmentId: 20, contextLocationId: 10 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(repo.deleteBranch).not.toHaveBeenCalled();
      expect(repo.deleteLocation).not.toHaveBeenCalled();
      expect(repo.deleteDepartment).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "hr_admin"])(
    "allows %s to delete unused entities",
    async (role) => {
      const caller = callerFor(role);
      await expect(caller.deleteBranch({ branchId: 3 })).resolves.toEqual({
        removed: true,
      });
      await expect(caller.deleteLocation({ locationId: 10 })).resolves.toEqual({
        removed: true,
      });
      await expect(
        caller.deleteDepartment({ departmentId: 20 }),
      ).resolves.toEqual({ removed: true });
    },
  );

  it("rejects unauthenticated deletion", async () => {
    await expect(
      callerFor(null).deleteBranch({ branchId: 3 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(repo.deleteBranch).not.toHaveBeenCalled();
  });
});
