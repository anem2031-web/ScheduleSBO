import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./workers.repository", () => ({
  getWorkerById: vi.fn(),
  updateWorker: vi.fn(),
}));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));
import { workersRouter } from "./workers.router";
import { getWorkerById, updateWorker } from "./workers.repository";
import { createAuditLog } from "../../shared/audit";

const caller = (role: "admin" | "hr_admin" | "supervisor") =>
  workersRouter.createCaller({ user: { id: 1, role } } as any);
const worker = {
  id: 9,
  nameAr: "عامل الاختبار",
  status: "active",
  isActive: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWorkerById).mockResolvedValue(worker as any);
  vi.mocked(updateWorker).mockImplementation(
    async (_id, changes) => ({ ...worker, ...changes }) as any,
  );
});

describe("worker archive and restore", () => {
  it.each(["admin", "hr_admin"] as const)(
    "archives for %s while retaining the worker record and an audit reason",
    async (role) => {
      const result = await caller(role).delete({
        id: 9,
        reason: "انتهاء ارتباط العامل",
      });
      expect(updateWorker).toHaveBeenCalledWith(9, {
        status: "terminated",
        isActive: false,
      });
      expect(result).toMatchObject({
        success: true,
        worker: { id: 9, status: "terminated", isActive: false },
      });
      expect(createAuditLog).toHaveBeenCalledWith(
        "worker",
        9,
        "update",
        1,
        expect.any(Object),
        { status: "terminated", isActive: false },
        "انتهاء ارتباط العامل",
      );
    },
  );
  it("rejects supervisors before looking up or updating a worker", async () => {
    await expect(
      caller("supervisor").delete({ id: 9, reason: "طلب حذف غير مصرح" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWorkerById).not.toHaveBeenCalled();
    expect(updateWorker).not.toHaveBeenCalled();
  });
  it("requires a reason and a valid worker ID", async () => {
    await expect(
      caller("admin").delete({ id: 9, reason: "  " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller("admin").delete({ id: 0, reason: "سجل غير صالح" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateWorker).not.toHaveBeenCalled();
  });
  it("does not claim success for an unknown worker", async () => {
    vi.mocked(getWorkerById).mockResolvedValue(undefined);
    await expect(
      caller("admin").delete({ id: 404, reason: "طلب إزالة سجل مفقود" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateWorker).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
  it.each(["admin", "hr_admin"] as const)(
    "restores status and active visibility together for %s",
    async (role) => {
      vi.mocked(getWorkerById).mockResolvedValue({
        ...worker,
        status: "terminated",
        isActive: false,
      } as any);
      await caller(role).changeStatus({
        id: 9,
        status: "active",
        reason: "استعادة العامل للعمل",
      });
      expect(updateWorker).toHaveBeenCalledWith(9, {
        status: "active",
        isActive: true,
      });
    },
  );
  it("does not let a supervisor restore an archived worker", async () => {
    await expect(
      caller("supervisor").changeStatus({
        id: 9,
        status: "active",
        reason: "طلب غير مصرح",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateWorker).not.toHaveBeenCalled();
  });
});
