import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  insertAssignment: vi.fn(),
  findById: vi.fn(),
  findActivePrimaryByWorker: vi.fn(),
  closeAssignment: vi.fn(),
}));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));
vi.mock("./supervisor-assignments.repository", () => ({
  insertAssignment: mocks.insertAssignment,
  findById: mocks.findById,
  findActivePrimaryByWorker: mocks.findActivePrimaryByWorker,
  closeAssignment: mocks.closeAssignment,
  listAssignments: vi.fn(),
}));
import { createAssignment } from "./supervisor-assignments.service";
function databaseFixture(supervisor: Record<string, unknown>) {
  const results = [[{ id: 9, nameAr: "عامل" }], [supervisor]];
  const db = {
    select: vi.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(results.shift()),
      };
      return chain;
    }),
  };
  mocks.getDb.mockResolvedValue(db);
}
beforeEach(() => vi.resetAllMocks());

describe("archived supervisor assignment", () => {
  it("rejects a disabled supervisor before adding a link or replacing an existing primary link", async () => {
    databaseFixture({
      id: 2,
      name: "مشرف مؤرشف",
      role: "supervisor",
      isActive: false,
    });
    await expect(
      createAssignment({
        workerId: 9,
        supervisorId: 2,
        assignmentType: "primary",
        createdBy: 1,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("مؤرشف"),
    });
    expect(mocks.insertAssignment).not.toHaveBeenCalled();
    expect(mocks.findActivePrimaryByWorker).not.toHaveBeenCalled();
    expect(mocks.closeAssignment).not.toHaveBeenCalled();
  });
  it("allows a restored active supervisor to receive a new link", async () => {
    databaseFixture({
      id: 2,
      name: "مشرف نشط",
      role: "supervisor",
      isActive: true,
    });
    mocks.insertAssignment.mockResolvedValue(11);
    mocks.findById.mockResolvedValue({ id: 11, workerId: 9, supervisorId: 2 });
    await expect(
      createAssignment({
        workerId: 9,
        supervisorId: 2,
        assignmentType: "secondary",
        createdBy: 1,
      }),
    ).resolves.toMatchObject({ id: 11 });
    expect(mocks.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ workerId: 9, supervisorId: 2 }),
    );
  });
});
