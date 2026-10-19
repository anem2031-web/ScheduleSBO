import { afterEach, describe, expect, it, vi } from "vitest";
import * as math from "../../../shared/weekly-schedule";
import { reconcileRosterModel, rosterCellKey, workerRestLabel, type BoardAssignment, type BoardWorker, type RosterInput, type RosterSnapshot } from "../../../client/src/components/schedules/weekly-board-model";

const saturday = "2026-10-17", sunday = "2026-10-18", monday = "2026-10-19";
const dates = [saturday, sunday, monday, "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const person = (id = 7, changes: Partial<BoardWorker> = {}): BoardWorker => ({
  id, employeeId: `EMP${id}`, name: `عامل ${id}`, departmentId: 1,
  departmentName: "الصيانة", costCenter: "المطاعم", locationName: "مطعم 1",
  requiredDailyMinutes: 540, weeklyRestDay: 5, permissions: [], calendar: [],
  supervisors: [
    { id: 12, name: "الصيانة", isActive: true, effectiveFrom: "2026-01-01", effectiveTo: null },
    { id: 99, name: "المطاعم", isActive: true, effectiveFrom: "2026-01-01", effectiveTo: null },
  ],
  ...changes,
});
const shift = (id: number, workerId: number, supervisorId: number, workDate: string, startTime: string, endTime: string, plannedMinutes: number, breakMinutes = 0): BoardAssignment => ({
  id, workerId, supervisorId, workDate, startTime, endTime, plannedMinutes, breakMinutes,
  crossesMidnight: endTime < startTime, periodId: 1, shiftTemplateId: 1, departmentId: 1,
  status: "planned", createdBy: 1, updatedBy: null,
  createdAt: new Date("2026-10-17T00:00:00Z"), updatedAt: new Date("2026-10-17T00:00:00Z"),
  cancelReason: null, transferredToId: null,
});
const fixture = (): RosterInput => ({
  workers: [person(), person(8)], dates, ownerId: 12, drafts: {},
  assignments: [
    shift(1, 7, 12, saturday, "05:00", "10:00", 300),
    shift(2, 7, 99, saturday, "16:00", "20:30", 240, 30),
    shift(3, 7, 12, sunday, "06:00", "15:30", 540, 30),
    shift(4, 8, 12, saturday, "07:00", "16:30", 540, 30),
    shift(5, 8, 99, monday, "15:30", "01:00", 540, 30),
  ],
});
const cell = (snapshot: RosterSnapshot, workerId: number, date: string) => snapshot.model.get(workerId)!.cells.get(date)!;
function expectUntouched(previous: RosterSnapshot, next: RosterSnapshot, changedDate = saturday) {
  expect(next.model.get(8)).toBe(previous.model.get(8));
  for (const date of dates.filter((day) => day !== changedDate))
    expect(cell(next, 7, date)).toBe(cell(previous, 7, date));
}

describe("incremental weekly roster reconciliation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a single draft replaces only the target cell and row, preserving all other row/day references", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const work = vi.spyOn(math, "intervalWorkMinutes");
    const next = reconcileRosterModel(previous, { ...input, drafts: {
      [rosterCellKey(7, saturday)]: { workerId: 7, workDate: saturday, intervals: [{ startTime: "06:30", endTime: "08:30" }] },
    } });
    expect(next.model).not.toBe(previous.model);
    expect(next.model.get(7)).not.toBe(previous.model.get(7));
    expect(cell(next, 7, saturday)).not.toBe(cell(previous, 7, saturday));
    expectUntouched(previous, next);
    expect(cell(next, 7, saturday).total).toBe(360);
    expect(next.model.get(7)?.planned).toBe(900);
    expect(previous.model.get(7)?.planned).toBe(1080);
    expect(cell(next, 7, saturday).others.map((row) => row.supervisorId)).toEqual([99]);
    expect(next.stats).toEqual({ indexedAssignments: 0, recalculatedCells: 1, rebuiltWorkers: 1 });
    expect(work).toHaveBeenCalled();
    expect(work.mock.calls.every(([interval]) => interval.startTime === "06:30")).toBe(true);
  });

  it("a 32-worker seven-day page calculates 224 initial cells and only one cell/row per edit and save reconciliation", () => {
    const workers = Array.from({ length: 32 }, (_, index) => person(index + 1));
    let nextId = 1;
    const assignments = workers.flatMap((worker) => dates.slice(0, 6).flatMap((date) => [
      shift(nextId++, worker.id, 12, date, "05:00", "10:00", 300),
      shift(nextId++, worker.id, 99, date, "16:00", "20:30", 240, 30),
    ]));
    const input: RosterInput = { workers, assignments, dates, ownerId: 12, drafts: {} };
    const initial = reconcileRosterModel(undefined, input);
    expect(initial.stats).toEqual({ indexedAssignments: 384, recalculatedCells: 224, rebuiltWorkers: 32 });
    const editedInput: RosterInput = { ...input, drafts: {
      [rosterCellKey(1, saturday)]: { workerId: 1, workDate: saturday, intervals: [{ startTime: "06:30", endTime: "08:30" }] },
    } };
    const work = vi.spyOn(math, "intervalWorkMinutes");
    const edited = reconcileRosterModel(initial, editedInput);
    expect(edited.stats).toEqual({ indexedAssignments: 0, recalculatedCells: 1, rebuiltWorkers: 1 });
    expect(work.mock.calls.every(([interval]) => interval.startTime === "06:30")).toBe(true);
    const savedInput: RosterInput = { ...editedInput, workers: structuredClone(workers), assignments: assignments.map((row) => row.id === 1
      ? { ...row, id: 10001, startTime: "06:30", endTime: "08:30", plannedMinutes: 120, updatedAt: new Date("2026-10-19T00:00:00Z") }
      : { ...row, updatedAt: new Date("2026-10-19T00:00:00Z") }) };
    const refreshed = reconcileRosterModel(edited, savedInput);
    expect(refreshed.stats).toEqual({ indexedAssignments: 384, recalculatedCells: 1, rebuiltWorkers: 1 });
    const cleared = reconcileRosterModel(refreshed, { ...savedInput, drafts: {} });
    expect(cleared.stats).toEqual({ indexedAssignments: 0, recalculatedCells: 1, rebuiltWorkers: 1 });
    expect(cleared.model.get(1)?.planned).toBe(3060);
    for (const next of [edited, refreshed, cleared]) {
      for (let workerId = 2; workerId <= 32; workerId++) expect(next.model.get(workerId)).toBe(initial.model.get(workerId));
      for (const date of dates.slice(1)) expect(cell(next, 1, date)).toBe(cell(initial, 1, date));
    }
  });

  it("an equivalent new draft object performs no interval calculations or reference churn", () => {
    const input = fixture();
    input.drafts = { [rosterCellKey(7, saturday)]: { workerId: 7, workDate: saturday, intervals: [{ startTime: "06:30", endTime: "08:30" }] } };
    const previous = reconcileRosterModel(undefined, input);
    const work = vi.spyOn(math, "intervalWorkMinutes"), overlap = vi.spyOn(math, "intervalOverlapMinutes");
    const next = reconcileRosterModel(previous, { ...input, drafts: structuredClone(input.drafts) });
    expect(next.model).toBe(previous.model);
    expect(next.stats).toEqual({ indexedAssignments: 0, recalculatedCells: 0, rebuiltWorkers: 0 });
    expect(work).not.toHaveBeenCalled();
    expect(overlap).not.toHaveBeenCalled();
  });

  it("deletion removes only the selected supervisor and reverting restores the saved shared balance", () => {
    const input = fixture(), original = reconcileRosterModel(undefined, input);
    const deleted = reconcileRosterModel(original, { ...input, drafts: {
      [rosterCellKey(7, saturday)]: { workerId: 7, workDate: saturday, intervals: [] },
    } });
    expectUntouched(original, deleted);
    expect(cell(deleted, 7, saturday).mine).toEqual([]);
    expect(cell(deleted, 7, saturday).total).toBe(240);
    expect(deleted.model.get(7)?.planned).toBe(780);
    expect(cell(deleted, 7, saturday).changed).toBe(true);
    const reverted = reconcileRosterModel(deleted, input);
    expectUntouched(deleted, reverted);
    expect(reverted.model.get(7)?.planned).toBe(1080);
    expect(cell(reverted, 7, saturday).total).toBe(540);
    expect(cell(reverted, 7, saturday).changed).toBe(false);
  });

  it("saving a draft reconciles only its changed assignment and clears its draft flag", () => {
    const input = fixture();
    const staged = reconcileRosterModel(undefined, { ...input, drafts: {
      [rosterCellKey(7, saturday)]: { workerId: 7, workDate: saturday, intervals: [{ startTime: "06:30", endTime: "08:30" }] },
    } });
    const work = vi.spyOn(math, "intervalWorkMinutes");
    const saved = { ...input, workers: structuredClone(input.workers), assignments: input.assignments.map((row) => row.id === 1
      ? { ...row, id: 1001, startTime: "06:30", endTime: "08:30", plannedMinutes: 120, updatedAt: new Date("2026-10-19T00:00:00Z") }
      : { ...row, updatedAt: new Date("2026-10-19T00:00:00Z") }) };
    const next = reconcileRosterModel(staged, saved);
    expectUntouched(staged, next);
    expect(next.model.get(7)?.planned).toBe(900);
    expect(cell(next, 7, saturday).changed).toBe(false);
    expect(cell(next, 7, saturday).mine).toEqual([{ startTime: "06:30", endTime: "08:30", breakMinutes: 0, departmentId: 1 }]);
    expect(work.mock.calls.every(([interval]) => interval.startTime === "06:30")).toBe(true);
  });

  it("a timestamp-only refresh reuses every cell and row without redoing any interval arithmetic", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const work = vi.spyOn(math, "intervalWorkMinutes"), overlap = vi.spyOn(math, "intervalOverlapMinutes");
    const next = reconcileRosterModel(previous, { ...input,
      workers: structuredClone(input.workers), dates: [...dates],
      assignments: input.assignments.map((row) => ({ ...row, createdAt: new Date("2026-10-18T00:00:00Z"), updatedAt: new Date("2026-10-19T00:00:00Z") })),
    });
    expect(next.model).toBe(previous.model);
    expect(next.stats.recalculatedCells).toBe(0);
    expect(next.stats.rebuiltWorkers).toBe(0);
    expect(work).not.toHaveBeenCalled();
    expect(overlap).not.toHaveBeenCalled();
  });

  it("a worker name-only refresh does not recalculate balance cells", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const work = vi.spyOn(math, "intervalWorkMinutes"), overlap = vi.spyOn(math, "intervalOverlapMinutes");
    const next = reconcileRosterModel(previous, { ...input, workers: input.workers.map((row) => row.id === 7 ? { ...row, name: "الاسم المعدل" } : row) });
    expect(next.model).toBe(previous.model);
    expect(work).not.toHaveBeenCalled();
    expect(overlap).not.toHaveBeenCalled();
  });

  it("a persisted change to another supervisor's period updates only the shared worker's target day", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, assignments: input.assignments.map((row) => row.id === 2
      ? { ...row, endTime: "21:30", plannedMinutes: 300 } : row) });
    expectUntouched(previous, next);
    expect(cell(next, 7, saturday).total).toBe(600);
    expect(next.model.get(7)?.planned).toBe(1140);
  });

  it("a persisted status approval refreshes only the target day without changing weekly hours", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, assignments: input.assignments.map((row) => row.id === 2 ? { ...row, status: "confirmed" as const } : row) });
    expectUntouched(previous, next);
    expect(cell(next, 7, saturday)).not.toBe(cell(previous, 7, saturday));
    expect(next.model.get(7)?.planned).toBe(1080);
    expect(cell(next, 7, saturday).others[0].status).toBe("confirmed");
  });

  it("a newly approved sick day changes only that day's rest label and required budget", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, workers: input.workers.map((row) => row.id === 7
      ? { ...row, calendar: [{ date: sunday, label: "إجازة مرضية" }] } : row) });
    expectUntouched(previous, next, sunday);
    expect(cell(next, 7, sunday).rest).toBe("إجازة مرضية");
    expect(next.model.get(7)?.required).toBe(5 * 540);
    expect(next.model.get(7)?.planned).toBe(1080);
  });

  it("retains the same calendar-label precedence as editing checks when historical entries share one date", () => {
    const input = fixture();
    input.workers[0] = { ...input.workers[0], calendar: [
      { date: sunday, label: "إجازة مرضية" },
      { date: sunday, label: "إجازة سنوية" },
    ] };
    const value = reconcileRosterModel(undefined, input);
    expect(cell(value, 7, sunday).rest).toBe(workerRestLabel(input.workers[0], sunday));
    expect(cell(value, 7, sunday).rest).toBe("إجازة مرضية");
    expect(value.model.get(7)?.required).toBe(5 * 540);
  });

  it("permission approval and a subsequent mode change update one cell and the exact weekly required delta", () => {
    const input = fixture(), original = reconcileRosterModel(undefined, input);
    const withPermission: RosterInput = { ...input, workers: input.workers.map((row) => row.id === 7 ? { ...row,
      permissions: [{ id: 9, workDate: saturday, startTime: "08:00", endTime: "08:30", mode: "excused", minutes: 30 }],
    } : row) };
    const excused = reconcileRosterModel(original, withPermission);
    expectUntouched(original, excused);
    expect(cell(excused, 7, saturday).total).toBe(510);
    expect(excused.model.get(7)?.planned).toBe(1050);
    expect(excused.model.get(7)?.required).toBe(6 * 540 - 30);
    const makeup = reconcileRosterModel(excused, { ...withPermission, workers: withPermission.workers.map((row) => row.id === 7
      ? { ...row, permissions: row.permissions.map((permission) => ({ ...permission, mode: "make_up" as const })) } : row) });
    expectUntouched(excused, makeup);
    expect(makeup.model.get(7)?.planned).toBe(1050);
    expect(makeup.model.get(7)?.required).toBe(6 * 540);
  });

  it("post-midnight permission remains in its original operational date and preserves the other worker", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, workers: input.workers.map((row) => row.id === 8 ? { ...row,
      permissions: [{ id: 9, workDate: monday, startTime: "00:30", endTime: "01:00", mode: "excused", minutes: 30 }],
    } : row) });
    expect(next.model.get(7)).toBe(previous.model.get(7));
    expect(cell(next, 8, saturday)).toBe(cell(previous, 8, saturday));
    expect(cell(next, 8, sunday)).toBe(cell(previous, 8, sunday));
    expect(cell(next, 8, monday).total).toBe(510);
    expect(next.model.get(8)?.planned).toBe(1050);
    expect(next.model.get(8)?.required).toBe(6 * 540 - 30);
  });

  it("changing the daily budget recalculates only that worker's requirements and preserves all hours", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, workers: input.workers.map((row) => row.id === 7 ? { ...row, requiredDailyMinutes: 480 } : row) });
    expect(next.model.get(8)).toBe(previous.model.get(8));
    expect(next.model.get(7)?.required).toBe(6 * 480);
    expect(next.model.get(7)?.planned).toBe(1080);
  });

  it("removing the configured budget preserves an unknown requirement and does not disturb another worker", () => {
    const input = fixture(), previous = reconcileRosterModel(undefined, input);
    const next = reconcileRosterModel(previous, { ...input, workers: input.workers.map((row) => row.id === 7 ? { ...row, requiredDailyMinutes: null } : row) });
    expect(next.model.get(8)).toBe(previous.model.get(8));
    expect(next.model.get(7)?.required).toBeNull();
    expect(next.model.get(7)?.planned).toBe(1080);
  });

  it("owner changes regroup periods while preserving the persisted shared weekly balance including legacy saved minutes", () => {
    const input = fixture();
    input.assignments[0].plannedMinutes = 299;
    const original = reconcileRosterModel(undefined, input);
    const evening = reconcileRosterModel(original, { ...input, ownerId: 99 });
    expect(evening.model.get(7)?.planned).toBe(1079);
    expect(cell(evening, 7, saturday).mine).toEqual([{ startTime: "16:00", endTime: "20:30", breakMinutes: 30, departmentId: 1 }]);
    const unselected = reconcileRosterModel(evening, { ...input, ownerId: undefined });
    expect(unselected.model.get(7)?.planned).toBe(1079);
    expect(cell(unselected, 7, saturday).mine).toEqual([]);
    expect(cell(unselected, 7, saturday).others).toHaveLength(2);
    expect(cell(unselected, 7, saturday).total).toBe(539);
  });

  it("changing week and page drops stale workers/dates/drafts instead of carrying their prior balances forward", () => {
    const input = fixture(), original = reconcileRosterModel(undefined, input);
    const nextDate = "2026-10-24";
    const next = reconcileRosterModel(original, {
      workers: [person(9)], assignments: [shift(10, 9, 12, nextDate, "05:00", "14:30", 540, 30)],
      dates: [nextDate], ownerId: 12,
      drafts: { [rosterCellKey(7, saturday)]: { workerId: 7, workDate: saturday, intervals: [] } },
    });
    expect(Array.from(next.model.keys())).toEqual([9]);
    expect(Array.from(next.model.get(9)!.cells.keys())).toEqual([nextDate]);
    expect(next.model.get(9)?.planned).toBe(540);
    expect(next.model.get(9)?.required).toBe(540);
  });
});
