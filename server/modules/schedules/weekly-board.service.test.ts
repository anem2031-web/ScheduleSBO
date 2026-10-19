import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
vi.mock("../overtime/approved-overtime", () => ({
  approvedOvertimeForWorkers: async () => new Map(),
}));
vi.mock("../leaves/approved-absence", () => ({
  approvedAbsencesForWorkers: async () => new Map(),
  approvedAbsenceForRange: async () => ({
    permissions: [],
    excusedMinutesByDate: new Map(),
  }),
  permissionOverlapMinutes: () => 0,
  validateApprovedPermissionOverlap: async () => {},
}));
import { getWeeklyBoard, saveWeeklyCells } from "./weekly-board.service";

function query(rows: unknown[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    for: () => Promise.resolve(rows),
    then: (resolve: any, reject: any) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}
function transactionFixture(results: unknown[][]) {
  if(results.length >= 4) results.splice(4,0,
    [{ id:1, code:'MAIN', nameAr:'المركز', isActive:true }],
    [{ id:11, code:'SITE', nameAr:'الموقع', isActive:true }],
    [{ id:1, code:'DEPT', nameAr:'القسم', isActive:true }],
    [{ id:21, code:'JOB', titleAr:'عامل', departmentId:1, isActive:true, effectiveFrom:'2020-01-01', effectiveTo:null }],
    [{ branchId:1,locationId:11 }], [{ locationId:11,departmentId:1 }]);
  const tx = {
    select: vi.fn(() => query(results.shift() ?? [])),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const rollback = vi.fn();
  const db = {
    transaction: vi.fn(async (work: (t: typeof tx) => Promise<unknown>) => {
      try {
        return await work(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  return { tx, db, rollback };
}
const worker = { id: 7, isActive: true, status: "active", departmentId: 1, locationId: 11, jobTitleId: 21 };
const owner = { id: 12, role: "supervisor", isActive: true };
const link = {
  workerId: 7,
  supervisorId: 12,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};
const settings = {
  workerId: 7,
  weeklyRestDay: 6,
  branch: "1",
  requiredHoursPerDay: "9",
  maxDailyHours: "12",
  allowedShifts: null,
};

describe("scoped direct weekly scheduling", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects unsupported writers before reaching the database", async () => {
    await expect(
      saveWeeklyCells(
        { id: 2, role: "modifier", permissions: ["schedule:read"] },
        {
          weekStart: "2026-10-18",
          supervisorId: 12,
          changes: [{ workerId: 7, workDate: "2026-10-18", intervals: [] }],
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects malformed dates and duplicate cells before any transaction", async () => {
    const actor = { id: 12, role: "supervisor" },
      cell = { workerId: 7, workDate: "2026-10-18", intervals: [] };
    await expect(
      saveWeeklyCells(actor, { weekStart: "2026-10-17", changes: [cell] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      saveWeeklyCells(actor, {
        weekStart: "2026-10-18",
        changes: [cell, cell],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("a supervisor cannot spoof another supervisor or edit an expired worker link", async () => {
    const { tx, rollback } = transactionFixture([
      [worker],
      [owner],
      [{ ...link, effectiveTo: "2026-10-17" }],
    ]);
    await expect(
      saveWeeklyCells(
        { id: 12, role: "supervisor" },
        {
          weekStart: "2026-10-18",
          supervisorId: 99,
          changes: [
            {
              workerId: 7,
              workDate: "2026-10-18",
              intervals: [{ startTime: "06:00", endTime: "10:00" }],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledOnce();
  });
  it("rejects overlap with another supervisor including the previous overnight shift before all writes", async () => {
    const existing = {
      id: 55,
      workerId: 7,
      supervisorId: 99,
      workDate: "2026-10-17",
      startTime: "22:00:00",
      endTime: "07:00:00",
      crossesMidnight: true,
      plannedMinutes: 540,
      status: "planned",
    };
    const { tx, rollback } = transactionFixture([
      [worker],
      [owner],
      [link],
      [settings],
      [],
      [existing],
      [],
    ]);
    await expect(
      saveWeeklyCells(
        { id: 12, role: "supervisor" },
        {
          weekStart: "2026-10-18",
          changes: [
            {
              workerId: 7,
              workDate: "2026-10-19",
              intervals: [{ startTime: "08:00", endTime: "10:00" }],
            },
            {
              workerId: 7,
              workDate: "2026-10-18",
              intervals: [{ startTime: "06:00", endTime: "10:00" }],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledOnce();
  });
  it("blocks changing completed work and working on the weekly rest day", async () => {
    const fixture = transactionFixture([
      [worker],
      [owner],
      [link],
      [settings],
      [],
      [],
      [],
    ]);
    await expect(
      saveWeeklyCells(
        { id: 12, role: "supervisor" },
        {
          weekStart: "2026-10-18",
          changes: [
            {
              workerId: 7,
              workDate: "2026-10-24",
              intervals: [{ startTime: "06:00", endTime: "10:00" }],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fixture.tx.insert).not.toHaveBeenCalled();
    transactionFixture([
      [worker],
      [owner],
      [link],
      [settings],
      [],
      [
        {
          id: 1,
          workerId: 7,
          supervisorId: 12,
          workDate: "2026-10-18",
          startTime: "06:00:00",
          endTime: "10:00:00",
          crossesMidnight: false,
          plannedMinutes: 240,
          status: "completed",
        },
      ],
    ]);
    await expect(
      saveWeeklyCells(
        { id: 12, role: "supervisor" },
        {
          weekStart: "2026-10-18",
          changes: [{ workerId: 7, workDate: "2026-10-18", intervals: [] }],
        },
      ),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("rejects a destination outside a linked supervisor's centers before changing any records", async () => {
    const { tx, rollback } = transactionFixture([[worker], [owner], [link], [settings], [], []]);
    await expect(saveWeeklyCells(
      { id: 12, role: "supervisor", accessScope: { costCenterIds: [2] } },
      { weekStart: "2026-10-18", changes: [{ workerId: 7, workDate: "2026-10-18", intervals: [{ startTime: "06:00", endTime: "10:00" }] }] },
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.insert).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled(); expect(rollback).toHaveBeenCalledOnce();
  });
  it("commits assignments, shared-worker notifications, balances and audit in one transaction", async () => {
    const template = {
      id: 4,
      code: "MORNING",
      startTime: "06:00:00",
      endTime: "10:00:00",
      departmentId: 1,
      effectiveFrom: null,
      effectiveTo: null,
    };
    const period = {
      id: 30,
      startDate: "2026-10-18",
      endDate: "2026-10-24",
      status: "draft",
    };
    const fixture = transactionFixture([
      [worker],
      [owner],
      [link],
      [settings],
      [],
      [],
      [template],
      [period],
      [],
      [{ plannedMinutes: 240 }],
      [{ ...link, supervisorId: 99 }],
    ]);
    const writes: Array<{ table: string; values: any }> = [];
    fixture.tx.insert.mockImplementation(
      (table: any) =>
        ({
          values: (values: any) => {
            writes.push({ table: getTableName(table), values });
            return {
              then: (resolve: any) => Promise.resolve(undefined).then(resolve),
              onDuplicateKeyUpdate: () => Promise.resolve(undefined),
            };
          },
        }) as any,
    );
    const result = await saveWeeklyCells(
      { id: 12, role: "supervisor" },
      {
        weekStart: "2026-10-18",
        changes: [
          {
            workerId: 7,
            workDate: "2026-10-18",
            intervals: [{ startTime: "06:00", endTime: "10:00" }],
          },
        ],
      },
    );
    expect(fixture.db.transaction).toHaveBeenCalledOnce();
    expect(fixture.rollback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      savedCells: 1,
      periodId: 30,
      notifiedSupervisors: 1,
    });
    expect(writes.map((w) => w.table)).toEqual([
      "shift_assignments",
      "time_balances",
      "notifications",
      "audit_logs",
    ]);
    expect(
      writes.find((w) => w.table === "shift_assignments")?.values,
    ).toMatchObject({
      supervisorId: 12,
      status: "planned",
      plannedMinutes: 240,
      costCenterId: 1,
      locationId: 11,
      departmentId: 1,
      jobTitleId: 21,
    });
    expect(
      writes.find((w) => w.table === "notifications")?.values[0].userId,
    ).toBe(99);
    expect(
      writes.find((w) => w.table === "time_balances")?.values,
    ).toMatchObject({
      requiredMinutes: 3240,
      scheduledMinutes: 240,
      remainingMinutes: 3000,
    });
  });

  it("creates the hidden week period and time template while saving direct intervals", async () => {
    const template = {
      id: 4,
      code: "DIRECT_0600_1000",
      startTime: "06:00:00",
      endTime: "10:00:00",
      departmentId: null,
      effectiveFrom: null,
      effectiveTo: null,
    };
    const period = {
      id: 30,
      startDate: "2026-10-18",
      endDate: "2026-10-24",
      status: "draft",
    };
    const fixture = transactionFixture([
      [worker],
      [owner],
      [link],
      [settings],
      [],
      [],
      [],
      [],
      [period],
      [template],
      [],
      [{ plannedMinutes: 240 }],
      [],
    ]);
    const writes: Array<{ table: string; values: any }> = [];
    fixture.tx.insert.mockImplementation(
      (table: any) =>
        ({
          values: (values: any) => {
            writes.push({ table: getTableName(table), values });
            return {
              then: (resolve: any) => Promise.resolve(undefined).then(resolve),
              onDuplicateKeyUpdate: () => Promise.resolve(undefined),
              $returningId: () => Promise.resolve([{ id: 30 }]),
            };
          },
        }) as any,
    );
    const result = await saveWeeklyCells(
      { id: 12, role: "supervisor" },
      {
        weekStart: "2026-10-18",
        changes: [
          {
            workerId: 7,
            workDate: "2026-10-18",
            intervals: [{ startTime: "06:00", endTime: "10:00" }],
          },
        ],
      },
    );
    expect(fixture.rollback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      periodId: 30,
      savedCells: 1,
      notifiedSupervisors: 0,
    });
    expect(writes.map((w) => w.table)).toEqual([
      "schedule_periods",
      "shift_templates",
      "shift_assignments",
      "time_balances",
      "audit_logs",
    ]);
    expect(writes[0].values.name).toBe("أسبوع 2026-10-18");
    expect(writes[1].values).toMatchObject({
      code: "DIRECT_0600_1000",
      durationMinutes: 240,
      crossesMidnight: false,
    });
  });
});
