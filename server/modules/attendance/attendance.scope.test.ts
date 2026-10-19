import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
vi.mock("./attendance.service", () => ({ AttendanceError: class extends Error {}, getByDate: vi.fn(), getDailyAttendance: vi.fn(), correctAttendance: vi.fn(), calculateDailyHours: vi.fn(), recordCheckOut: vi.fn(), approveCorrection: vi.fn() }));
vi.mock("./attendance.repository", () => ({ findById: vi.fn(), findCorrectionById: vi.fn() }));
vi.mock("../../shared/worker-scope", () => ({ assertWorkerInScope: vi.fn(), getScopedWorkerIds: vi.fn() }));
import { attendanceRouter } from "./attendance.router";
import * as service from "./attendance.service";
import * as repo from "./attendance.repository";
import { assertWorkerInScope, getScopedWorkerIds } from "../../shared/worker-scope";
const caller = (user: object) => attendanceRouter.createCaller({ user: { id: 42, role: "hr_admin", ...user } } as any);
describe("Attendance record and account scopes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScopedWorkerIds).mockResolvedValue([7]);
    vi.mocked(repo.findById).mockResolvedValue({ id: 99, workerId: 7 } as any);
  });
  it("maps a worker account to its linked worker ID rather than the user ID", async () => {
    await caller({ role: "worker", workerId: 7 }).getByDate({ date: new Date("2026-10-18T12:00:00Z") });
    expect(service.getByDate).toHaveBeenCalledWith({ workerId: 7, date: expect.any(Date) });
  });
  it("does not infer self-access from equality with the account ID", async () => {
    await expect(caller({ role: "worker", workerId: 7 }).getByDate({ workerId: 42, date: new Date() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.getByDate).not.toHaveBeenCalled();
  });
  it("does not permit correction by a read-only HR account", async () => {
    await expect(caller({ permissions: ["attendance:read"] }).correctAttendance({ attendanceId: 99, reason: "سبب تصحيح واضح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.correctAttendance).not.toHaveBeenCalled();
  });
  it("filters the daily query before pagination", async () => {
    await caller({ permissions: ["attendance:read"] }).getDailyAttendance({ date: new Date(), departmentId: 3, limit: 20, offset: 0 });
    expect(service.getDailyAttendance).toHaveBeenCalledWith(expect.objectContaining({ workerIds: [7], departmentId: 3, limit: 20 }));
  });
  it("checks the record owner before a correction", async () => {
    vi.mocked(assertWorkerInScope).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller({ permissions: ["attendance:correct"] }).correctAttendance({ attendanceId: 99, reason: "سبب تصحيح واضح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.correctAttendance).not.toHaveBeenCalled();
  });
  it("rejects a mismatched worker and attendance ID", async () => {
    await expect(caller({ permissions: ["attendance:record"] }).recordCheckOut({ attendanceId: 99, workerId: 8 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.recordCheckOut).not.toHaveBeenCalled();
  });
});
