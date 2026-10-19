import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), listAssignments: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
vi.mock("./assignments.service", () => ({
  listAssignments: mocks.listAssignments,
}));
import {
  assertScheduleWorkerRead,
  listScopedAssignments,
} from "./worker-scope";

function setLinks(ids: number[]) {
  mocks.getDb.mockResolvedValue({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(ids.map((workerId) => ({ workerId }))),
      }),
    }),
  });
}
describe("legacy schedule reads retain worker scope", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects a guessed worker id for card, timeline, leave and balance readers", async () => {
    setLinks([7]);
    await expect(
      assertScheduleWorkerRead({ id: 12, role: "supervisor" }, 999),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assertScheduleWorkerRead({ id: 12, role: "supervisor" }, 7),
    ).resolves.toBeUndefined();
  });
  it("filters an unqualified assignment listing to linked worker ids in one query", async () => {
    setLinks([7, 8, 7]);
    mocks.listAssignments.mockResolvedValue([{ id: 1 }]);
    const result = await listScopedAssignments(
      { id: 12, role: "supervisor" },
      { fromDate: "2026-10-17", toDate: "2026-10-23" },
    );
    expect(result).toEqual([{ id: 1 }]);
    expect(mocks.listAssignments).toHaveBeenCalledWith({
      fromDate: "2026-10-17",
      toDate: "2026-10-23",
      workerIds: [7, 8],
    });
  });
  it("does not allow a supervisor to bypass scope with a worker filter", async () => {
    setLinks([7]);
    await expect(
      listScopedAssignments({ id: 12, role: "supervisor" }, { workerId: 8 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listAssignments).not.toHaveBeenCalled();
  });
  it("permits a linked shared worker across their primary center while an empty center grant denies all", async () => {
    setLinks([7]);
    await expect(assertScheduleWorkerRead({ id: 12, role: "supervisor", accessScope: { costCenterIds: [2] } }, 7)).resolves.toBeUndefined();
    await expect(assertScheduleWorkerRead({ id: 12, role: "supervisor", accessScope: { costCenterIds: [] } }, 7)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertScheduleWorkerRead({ id: 12, role: "supervisor", accessScope: { costCenterIds: [2] } }, 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("returns no assignments for an unlinked supervisor and preserves administrative reads", async () => {
    setLinks([]);
    await expect(
      listScopedAssignments({ id: 12, role: "supervisor" }, {}),
    ).resolves.toEqual([]);
    expect(mocks.listAssignments).not.toHaveBeenCalled();
    mocks.listAssignments.mockResolvedValue([{ id: 5 }]);
    await expect(
      listScopedAssignments({ id: 1, role: "hr_admin" }, { workerId: 8 }),
    ).resolves.toEqual([{ id: 5 }]);
    expect(mocks.listAssignments).toHaveBeenCalledWith({ workerId: 8 });
  });
});
