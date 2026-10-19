import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./org-structure.repository", () => ({
  findBranchById: vi.fn(),
  findLocationById: vi.fn(),
  findLocationByCode: vi.fn(),
  findDepartmentByCode: vi.fn(),
  findDepartmentById: vi.fn(),
  insertLocationInBranch: vi.fn(),
  insertDepartmentInLocation: vi.fn(),
  listBranches: vi.fn(),
  listLocations: vi.fn(),
  listDepartments: vi.fn(),
  listBranchLocationLinks: vi.fn(),
  listLocationDepartmentLinks: vi.fn(),
  listJobTitles: vi.fn(),
}));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));

import * as repo from "./org-structure.repository";
import {
  createLocationInBranch,
  createDepartmentInLocation,
} from "./org-structure.service";

describe("Contextual organization setup", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not create an orphan location when its selected cost center is inactive", async () => {
    vi.mocked(repo.findBranchById).mockResolvedValue({
      id: 2,
      isActive: false,
    } as any);
    await expect(
      createLocationInBranch({
        branchId: 2,
        code: "L1",
        nameAr: "البوابة",
        createdBy: 1,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.insertLocationInBranch).not.toHaveBeenCalled();
  });

  it("creates a location and its selected cost-center link as one repository operation", async () => {
    vi.mocked(repo.findBranchById).mockResolvedValue({
      id: 2,
      isActive: true,
    } as any);
    vi.mocked(repo.findLocationByCode).mockResolvedValue(null);
    vi.mocked(repo.insertLocationInBranch).mockResolvedValue({
      id: 10,
      linkId: 20,
    });
    vi.mocked(repo.findLocationById).mockResolvedValue({
      id: 10,
      nameAr: "البوابة",
    } as any);
    const result = await createLocationInBranch({
      branchId: 2,
      code: " gate 1 ",
      nameAr: " البوابة ",
      createdBy: 1,
    });
    expect(repo.insertLocationInBranch).toHaveBeenCalledWith(
      { code: "GATE_1", nameAr: "البوابة" },
      2,
    );
    expect(result).toMatchObject({ id: 10, nameAr: "البوابة" });
  });

  it("does not duplicate an existing location while creating it in another context", async () => {
    vi.mocked(repo.findBranchById).mockResolvedValue({
      id: 2,
      isActive: true,
    } as any);
    vi.mocked(repo.findLocationByCode).mockResolvedValue({ id: 10 } as any);
    await expect(
      createLocationInBranch({
        branchId: 2,
        code: "L1",
        nameAr: "البوابة",
        createdBy: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.insertLocationInBranch).not.toHaveBeenCalled();
  });

  it("rejects a department with a deleted parent before persisting anything", async () => {
    vi.mocked(repo.findLocationById).mockResolvedValue(null);
    await expect(
      createDepartmentInLocation({
        locationId: 8,
        code: "D1",
        nameAr: "كاشير",
        createdBy: 1,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.insertDepartmentInLocation).not.toHaveBeenCalled();
  });

  it("creates the department in the selected location without modifying other links", async () => {
    vi.mocked(repo.findLocationById).mockResolvedValue({
      id: 8,
      isActive: true,
    } as any);
    vi.mocked(repo.findDepartmentByCode).mockResolvedValue(null);
    vi.mocked(repo.insertDepartmentInLocation).mockResolvedValue({
      id: 11,
      linkId: 21,
    });
    vi.mocked(repo.findDepartmentById).mockResolvedValue({ id: 11 } as any);
    await createDepartmentInLocation({
      locationId: 8,
      code: "cashier",
      nameAr: " كاشير ",
      createdBy: 1,
    });
    expect(repo.insertDepartmentInLocation).toHaveBeenCalledWith(
      { code: "CASHIER", nameAr: "كاشير" },
      8,
    );
  });

  it("propagates a failed transaction rather than claiming contextual creation succeeded", async () => {
    vi.mocked(repo.findLocationById).mockResolvedValue({
      id: 8,
      isActive: true,
    } as any);
    vi.mocked(repo.findDepartmentByCode).mockResolvedValue(null);
    vi.mocked(repo.insertDepartmentInLocation).mockRejectedValue(
      new Error("transaction failed"),
    );
    await expect(
      createDepartmentInLocation({
        locationId: 8,
        code: "D1",
        nameAr: "كاشير",
        createdBy: 1,
      }),
    ).rejects.toThrow("transaction failed");
    expect(repo.findDepartmentById).not.toHaveBeenCalled();
  });
});
