import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./operations.repository", () => ({
  supervisorWorkerIds: vi.fn(),
  dayWorkers: vi.fn(),
  dayAttendance: vi.fn(),
  dayAssignments: vi.fn(),
  dayCalendar: vi.fn(),
  pendingCorrections: vi.fn(),
  monthOvertimes: vi.fn(),
}));
import * as repo from "./operations.repository";
import {
  assertDay,
  buildDailyRows,
  dailyOverview,
  reviewQueue,
  scopeFor,
} from "./operations.service";
import {
  isNavigationActive,
  navigationForRole,
} from "../../../shared/navigation";

const worker = {
  id: 12,
  name: "عامل",
  employeeId: "12",
  department: "تشغيل",
  requiredHours: "9",
  restDay: 5,
  costCenter: "حديقة",
};
const punch = {
  id: 1,
  workerId: 12,
  checkInTime: new Date("2026-10-18T03:00:00Z"),
  checkOutTime: new Date("2026-10-18T07:00:00Z"),
  actualHours: "4",
  status: "present",
} as any;

beforeEach(() => vi.resetAllMocks());

describe("daily operational scope", () => {
  it("rejects roles without operational access before querying data", async () => {
    await expect(
      scopeFor({ id: 1, role: "worker" }, "2026-10-18"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.supervisorWorkerIds).not.toHaveBeenCalled();
  });
  it("passes an empty supervisor scope to every query instead of exposing all workers", async () => {
    vi.mocked(repo.supervisorWorkerIds).mockResolvedValue([]);
    vi.mocked(repo.dayWorkers).mockResolvedValue([]);
    vi.mocked(repo.dayAttendance).mockResolvedValue([]);
    vi.mocked(repo.dayAssignments).mockResolvedValue([]);
    vi.mocked(repo.dayCalendar).mockResolvedValue([]);
    const result = await dailyOverview(
      { id: 44, role: "supervisor" },
      "2026-10-18",
    );
    expect(repo.supervisorWorkerIds).toHaveBeenCalledWith(44, "2026-10-18");
    expect(repo.dayWorkers).toHaveBeenCalledWith([]);
    expect(repo.dayAttendance).toHaveBeenCalledWith("2026-10-18", []);
    expect(repo.dayAssignments).toHaveBeenCalledWith("2026-10-18", []);
    expect(repo.dayCalendar).toHaveBeenCalledWith("2026-10-18", []);
    expect(result.summary.workers).toBe(0);
  });
  it("scopes review records to a supervisor and does not grant attendance approval", async () => {
    vi.mocked(repo.supervisorWorkerIds).mockResolvedValue([12]);
    vi.mocked(repo.pendingCorrections).mockResolvedValue([]);
    vi.mocked(repo.monthOvertimes).mockResolvedValue([]);
    const result = await reviewQueue(
      { id: 44, role: "supervisor" },
      "2026-10",
      "2026-10-18",
    );
    expect(repo.pendingCorrections).toHaveBeenCalledWith([12]);
    expect(repo.monthOvertimes).toHaveBeenCalledWith("2026-10", [12]);
    expect(result.canApproveCorrections).toBe(false);
  });
  it("rejects impossible dates and invalid months", async () => {
    expect(() => assertDay("2026-02-30")).toThrow();
    expect(() => assertDay("not-a-date")).toThrow();
    expect(() => assertDay("2028-02-29")).not.toThrow();
    await expect(
      reviewQueue({ id: 1, role: "admin" }, "2026-13", "2026-10-18"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("daily hours have explicit meanings", () => {
  it("never turns planned hours into actual attendance", () => {
    const [row] = buildDailyRows(
      [worker],
      [],
      [{ workerId: 12, plannedMinutes: 300 }],
      "2026-10-18",
    );
    expect(row.actualHours).toBeNull();
    expect(row.plannedHours).toBe(5);
    expect(row.remainingToSchedule).toBe(4);
    expect(row.attended).toBe(false);
  });
  it("adds multiple completed attendance records without the gap between periods", () => {
    const later = {
      ...punch,
      id: 2,
      checkInTime: new Date("2026-10-18T15:00:00Z"),
      checkOutTime: new Date("2026-10-18T19:00:00Z"),
    };
    const [row] = buildDailyRows([worker], [punch, later], [], "2026-10-18");
    expect(row.actualHours).toBe(8);
    expect(row.onSite).toBe(false);
  });
  it("does not fabricate zero recorded hours for an open or incomplete record", () => {
    const [open] = buildDailyRows(
      [worker],
      [{ ...punch, checkOutTime: null, actualHours: null }],
      [],
      "2026-10-18",
    );
    expect(open.actualHours).toBeNull();
    expect(open.onSite).toBe(true);
    const [missing] = buildDailyRows(
      [worker],
      [{ ...punch, actualHours: null }],
      [],
      "2026-10-18",
    );
    expect(missing.actualHours).toBeNull();
  });
  it("excludes rest and approved calendar leave from the remaining schedule budget", () => {
    expect(
      buildDailyRows([worker], [], [], "2026-10-23")[0].remainingToSchedule,
    ).toBe(0);
    expect(
      buildDailyRows([worker], [], [], "2026-10-18", [
        { workerId: 12, code: "ANNUAL_LEAVE" },
      ])[0].remainingToSchedule,
    ).toBe(0);
    for (const code of [
      "REST",
      "REST_DAY",
      "WEEKLY_REST",
      "HOLIDAY",
      "PUBLIC_HOLIDAY",
    ]) {
      expect(
        buildDailyRows([worker], [], [], "2026-10-18", [
          { workerId: 12, code },
        ])[0].remainingToSchedule,
      ).toBe(0);
    }
  });
  it("keeps a morning late arrival visible after a normal evening attendance record", () => {
    const [row] = buildDailyRows(
      [worker],
      [
        { ...punch, status: "late" },
        { ...punch, id: 2 },
      ],
      [],
      "2026-10-18",
    );
    expect(row.status).toBe("present");
    expect(row.isLate).toBe(true);
  });
});

describe("simplified navigation", () => {
  it("includes the independent overtime task and keeps setup away from supervisors", () => {
    expect(navigationForRole("admin")).toHaveLength(6);
    expect(
      navigationForRole("supervisor").map((row) => row.path),
    ).not.toContain("/settings");
    expect(navigationForRole("unknown")).toEqual([]);
  });
  it("keeps worker details and legacy attendance paths under their primary task", () => {
    expect(isNavigationActive("/workers/12?tab=duty", "/workers")).toBe(true);
    expect(isNavigationActive("/attendance", "/dashboard")).toBe(true);
    expect(isNavigationActive("/supervisor-dashboard", "/dashboard")).toBe(
      true,
    );
    expect(isNavigationActive("/workers-extra", "/workers")).toBe(false);
  });
});
