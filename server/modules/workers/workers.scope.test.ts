import { beforeEach, describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  getWorkerById: vi.fn(),
  getWorkerByEmployeeId: vi.fn(),
  listWorkers: vi.fn(),
  getAllActiveWorkers: vi.fn(),
  getAllDepartments: vi.fn(),
  getDutySettings: vi.fn(),
  saveDutySettings: vi.fn(),
  getAllLocations: vi.fn(),
}));
const scope = vi.hoisted(() => ({getScopedWorkerIds:vi.fn(),assertWorkerInScope:vi.fn(),assertCostCenterScope:vi.fn()}));
vi.mock("../../shared/worker-scope", () => scope);
vi.mock("./workers.repository", () => repository);
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));
import { workersRouter } from "./workers.router";

const caller = (role: "supervisor" | "admin") =>
  workersRouter.createCaller({ user: { id: 7, role } } as any);
beforeEach(() => {
  vi.clearAllMocks();
  scope.getScopedWorkerIds.mockImplementation(async user => user.role === "supervisor" ? [11] : undefined);
  scope.assertWorkerInScope.mockResolvedValue(undefined);
  scope.assertCostCenterScope.mockResolvedValue(undefined);
  repository.getWorkerById.mockImplementation(async (id, scope) =>
    scope === 7 && id !== 11 ? undefined : { id, nameAr: "عامل" },
  );
  repository.getWorkerByEmployeeId.mockImplementation(async (id, scope) =>
    scope === 7 && id !== "W11" ? undefined : { id: 11 },
  );
  repository.listWorkers.mockResolvedValue({ items: [], total: 0 });
  repository.getAllActiveWorkers.mockResolvedValue([]);
  repository.getAllDepartments.mockResolvedValue([]);
  repository.getAllLocations.mockResolvedValue([]);
});
describe("supervisor worker access", () => {
  it("scopes paginated results, totals, the full list and worker reference rows to the current supervisor account", async () => {
    const api = caller("supervisor");
    await api.list({ page: 1, pageSize: 50 });
    await api.listAll();
    await api.referenceData();
    expect(repository.listWorkers).toHaveBeenCalledWith(
      expect.objectContaining({ supervisorUserId: 7 }),
    );
    expect(repository.getAllActiveWorkers).toHaveBeenNthCalledWith(1, 7, [11]);
    expect(repository.getAllActiveWorkers).toHaveBeenNthCalledWith(2, 7, [11]);
    expect(repository.listWorkers).toHaveBeenCalledWith(expect.objectContaining({workerIds:[11]}));
  });
  it("allows a linked worker but rejects guessed worker IDs and employee numbers outside the supervisor scope", async () => {
    const api = caller("supervisor");
    expect(await api.getById({ id: 11 })).toMatchObject({ id: 11 });
    await expect(api.getById({ id: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      api.getByEmployeeId({ employeeId: "w99" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.getWorkerByEmployeeId).toHaveBeenCalledWith("W99", 7);
  });
  it("preserves administrator access and rejects duty-setting writes from supervisors before reading or writing the database", async () => {
    expect(await caller("admin").getById({ id: 99 })).toMatchObject({ id: 99 });
    await expect(
      caller("supervisor").updateDutySettings({
        workerId: 11,
        requiredDailyHours: 9,
        weeklyRestDay: 6,
        branch: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.saveDutySettings).not.toHaveBeenCalled();
    expect(repository.getDutySettings).not.toHaveBeenCalled();
  });
  it("updates the default daily ceiling alongside required hours and rejects crossing a separately configured ceiling", async () => {
    repository.getDutySettings.mockResolvedValue({
      requiredHoursPerDay: "9",
      maxDailyHours: "9",
      branch: "QA_CC",
      weeklyRestDay: 5,
    });
    repository.saveDutySettings.mockResolvedValue({
      requiredHoursPerDay: "10",
      maxDailyHours: "10",
      branch: "QA_CC",
      weeklyRestDay: 5,
    });
    const input = {
      workerId: 11,
      requiredDailyHours: 10,
      weeklyRestDay: 5,
      branch: "QA_CC",
    };
    await caller("admin").updateDutySettings(input);
    expect(repository.saveDutySettings).toHaveBeenCalledWith(11, input, 10);
    repository.saveDutySettings.mockClear();
    repository.getDutySettings.mockResolvedValue({
      requiredHoursPerDay: "9",
      maxDailyHours: "12",
      branch: "QA_CC",
      weeklyRestDay: 5,
    });
    await expect(
      caller("admin").updateDutySettings({ ...input, requiredDailyHours: 13 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repository.saveDutySettings).not.toHaveBeenCalled();
  });
});
