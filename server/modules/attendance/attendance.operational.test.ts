import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./attendance.repository", () => ({ findByWorkerAndDate: vi.fn(), findById: vi.fn(), findWorkerAssignmentForDate: vi.fn(), insertAttendance: vi.fn(), updateAttendance: vi.fn() }));
vi.mock("../../shared/audit", () => ({ createAuditLog: vi.fn() }));
import * as repo from "./attendance.repository";
import { recordCheckIn, recordCheckOut } from "./attendance.service";
describe("Split shifts and operational-day attendance", () => {
  beforeEach(() => vi.resetAllMocks());
  it("records a 04:29 arrival against the preceding operational date", async () => {
    await recordCheckIn({ workerId: 7, checkInTime: new Date("2026-10-19T04:29:59+03:00"), recordedBy: 1 });
    expect(repo.insertAttendance).toHaveBeenCalledWith(expect.objectContaining({ attendanceDate: new Date("2026-10-18T00:00:00Z") }));
  });
  it("starts the new operational day exactly at 04:30", async () => {
    await recordCheckIn({ workerId: 7, checkInTime: new Date("2026-10-19T04:30:00+03:00"), recordedBy: 1 });
    expect(repo.insertAttendance).toHaveBeenCalledWith(expect.objectContaining({ attendanceDate: new Date("2026-10-19T00:00:00Z") }));
  });
  it("allows an evening arrival after a completed morning attendance", async () => {
    vi.mocked(repo.findByWorkerAndDate).mockResolvedValue({ id: 1, checkInTime: new Date("2026-10-18T05:00:00+03:00"), checkOutTime: new Date("2026-10-18T10:00:00+03:00") } as any);
    await recordCheckIn({ workerId: 7, checkInTime: new Date("2026-10-18T18:00:00+03:00"), recordedBy: 1 });
    expect(repo.insertAttendance).toHaveBeenCalled();
  });
  it("prevents a second arrival while the earlier attendance is still open", async () => {
    vi.mocked(repo.findByWorkerAndDate).mockResolvedValue({ id: 1, checkInTime: new Date(), checkOutTime: null } as any);
    await expect(recordCheckIn({ workerId: 7, recordedBy: 1 })).rejects.toThrow("بالفعل");
    expect(repo.insertAttendance).not.toHaveBeenCalled();
  });
  it("finds the prior day's restaurant arrival for 01:00 checkout and stores raw elapsed hours", async () => {
    vi.mocked(repo.findByWorkerAndDate).mockResolvedValue({ id: 9, workerId: 7, attendanceDate: new Date("2026-10-18T00:00:00Z"), checkInTime: new Date("2026-10-18T15:30:00+03:00"), checkOutTime: null, status: "present" } as any);
    await recordCheckOut({ workerId: 7, checkOutTime: new Date("2026-10-19T01:00:00+03:00"), recordedBy: 1 });
    expect(repo.findByWorkerAndDate).toHaveBeenCalledWith(7, new Date("2026-10-18T00:00:00Z"));
    expect(repo.updateAttendance).toHaveBeenCalledWith(9, expect.objectContaining({ actualHours: "9.50" }));
  });
});
