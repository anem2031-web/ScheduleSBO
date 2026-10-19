import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./supervisor-assignments.repository", () => ({
  currentWorkerIds: vi.fn(),
  listAssignments: vi.fn(),
}));
import * as repo from "./supervisor-assignments.repository";
import { listAssignmentsForViewer } from "./supervisor-assignments.service";
describe("supervisor collaboration visibility", () => {
  beforeEach(() => vi.resetAllMocks());
  it("scopes by worker, retaining the other supervisors' links for those workers", async () => {
    vi.mocked(repo.currentWorkerIds).mockResolvedValue([7]);
    const collaborations = [
      { workerId: 7, supervisorId: 2 },
      { workerId: 7, supervisorId: 3 },
    ];
    vi.mocked(repo.listAssignments).mockResolvedValue(collaborations as any);
    expect(
      await listAssignmentsForViewer({ id: 2, role: "supervisor" }, true),
    ).toEqual(collaborations);
    expect(repo.listAssignments).toHaveBeenCalledWith(true, [7]);
  });
  it("retains an empty worker scope instead of using the unrestricted default", async () => {
    vi.mocked(repo.currentWorkerIds).mockResolvedValue([]);
    vi.mocked(repo.listAssignments).mockResolvedValue([]);
    await listAssignmentsForViewer({ id: 2, role: "supervisor" }, true);
    expect(repo.listAssignments).toHaveBeenCalledWith(true, []);
  });
  it("retains administrative team visibility", async () => {
    vi.mocked(repo.listAssignments).mockResolvedValue([]);
    await listAssignmentsForViewer({ id: 1, role: "admin" }, false);
    expect(repo.currentWorkerIds).not.toHaveBeenCalled();
    expect(repo.listAssignments).toHaveBeenCalledWith(false);
  });
});
