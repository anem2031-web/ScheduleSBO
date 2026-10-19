import { describe, expect, it } from "vitest";
import { buildRosterModel, rosterCellKey, workerRestLabel, type BoardAssignment, type BoardWorker, type RosterDraft } from "../../../client/src/components/schedules/weekly-board-model";

const saturday = "2026-10-17", sunday = "2026-10-18";
const week = [saturday, sunday, "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const worker = (changes: Partial<BoardWorker> = {}): BoardWorker => ({
  id: 7, employeeId: "EMP7", name: "عامل مشترك", departmentId: 1,
  departmentName: "الصيانة", costCenter: "المطاعم", locationName: "مطعم 1",
  requiredDailyMinutes: 540, weeklyRestDay: 5, permissions: [], calendar: [],
  supervisors: [
    { id: 12, name: "الصيانة", isActive: true, effectiveFrom: "2026-01-01", effectiveTo: null },
    { id: 99, name: "المطاعم", isActive: true, effectiveFrom: "2026-01-01", effectiveTo: null },
  ],
  ...changes,
});
const assignment = (id: number, supervisorId: number, startTime: string, endTime: string, plannedMinutes: number, changes: Partial<BoardAssignment> = {}): BoardAssignment => ({
  id, workerId: 7, supervisorId, workDate: saturday, startTime, endTime,
  plannedMinutes, breakMinutes: 0, crossesMidnight: endTime < startTime,
  periodId: 1, shiftTemplateId: 1, departmentId: 1, status: "planned",
  createdBy: 1, updatedBy: null, createdAt: new Date("2026-10-17T00:00:00Z"),
  updatedAt: new Date("2026-10-17T00:00:00Z"), cancelReason: null, transferredToId: null,
  ...changes,
});
const sharedAssignments = () => [
  assignment(1, 12, "05:00", "10:00", 300),
  assignment(2, 99, "16:00", "20:30", 240, { breakMinutes: 30 }),
];
const permission = (mode: "excused" | "make_up", workDate = saturday, startTime = "08:00", endTime = "08:30", minutes = 30): BoardWorker["permissions"][number] => ({ id: 1, mode, workDate, startTime, endTime, minutes });
const draft = (workDate: string, intervals: RosterDraft["intervals"]): Record<string, RosterDraft> => ({
  [rosterCellKey(7, workDate)]: { workerId: 7, workDate, intervals },
});

describe("indexed weekly roster balance regression", () => {
  it("keeps the complete shared-worker balance when selecting either owner or no owner", () => {
    const rows = sharedAssignments();
    for (const owner of [12, 99, undefined]) {
      const value = buildRosterModel([worker()], rows, [saturday], {}, owner).get(7)!;
      expect(value.planned).toBe(540);
      expect(value.required).toBe(540);
      expect(value.cells.get(saturday)?.total).toBe(540);
    }
    const unselected = buildRosterModel([worker()], rows, [saturday], {}, undefined).get(7)!.cells.get(saturday)!;
    expect(unselected.mine).toEqual([]);
    expect(unselected.others.map((row) => row.supervisorId)).toEqual([12, 99]);
    expect(unselected.changed).toBe(false);
  });

  it("a staged replacement changes only the selected owner's cell and preserves the other supervisor", () => {
    const rows = sharedAssignments(), original = structuredClone(rows);
    const value = buildRosterModel([worker()], rows, [saturday], draft(saturday, [{ startTime: "06:00", endTime: "08:00" }]), 12).get(7)!;
    const cell = value.cells.get(saturday)!;
    expect(cell.mine).toEqual([{ startTime: "06:00", endTime: "08:00" }]);
    expect(cell.others).toEqual([rows[1]]);
    expect(cell.total).toBe(360);
    expect(value.planned).toBe(360);
    expect(value.required).toBe(540);
    expect(cell.changed).toBe(true);
    expect(rows).toEqual(original);
  });

  it("preserves persisted weekly minutes independently of the selected owner, recalculating only replacements", () => {
    // A legacy saved duration may differ from the clocks; choosing a supervisor must not change its weekly budget.
    const rows = sharedAssignments();
    rows[0].plannedMinutes = 299;
    for (const owner of [12, 99, undefined]) {
      const value = buildRosterModel([worker()], rows, [saturday], {}, owner).get(7)!;
      expect(value.planned).toBe(539);
    }
    const replacingMorning = buildRosterModel([worker()], rows, [saturday], draft(saturday, [{ startTime: "06:00", endTime: "08:00" }]), 12).get(7)!;
    expect(replacingMorning.planned).toBe(360);
    const replacingEvening = buildRosterModel([worker()], rows, [saturday], draft(saturday, [{ startTime: "16:00", endTime: "18:00" }]), 99).get(7)!;
    expect(replacingEvening.planned).toBe(419);
  });

  it("an explicitly empty draft removes the owner's period without restoring it or deleting other owners", () => {
    const value = buildRosterModel([worker()], sharedAssignments(), [saturday], draft(saturday, []), 12).get(7)!;
    expect(value.cells.get(saturday)?.mine).toEqual([]);
    expect(value.cells.get(saturday)?.others).toHaveLength(1);
    expect(value.cells.get(saturday)?.changed).toBe(true);
    expect(value.planned).toBe(240);
  });

  it("deducts one 30-minute break from both persisted and drafted overnight attendance", () => {
    const overnight = assignment(3, 99, "15:30", "01:00", 540, { breakMinutes: 30 });
    const persisted = buildRosterModel([worker()], [overnight], [saturday], {}, 99).get(7)!;
    const staged = buildRosterModel([worker()], [], [saturday], draft(saturday, [{ startTime: "16:00", endTime: "01:30", breakMinutes: 30 }]), 99).get(7)!;
    expect(persisted.planned).toBe(540);
    expect(staged.planned).toBe(540);
    expect(persisted.required).toBe(540);
    expect(staged.required).toBe(540);
  });

  it("attributes post-midnight permission to its operational day and does not subtract it on the next date", () => {
    const person = worker({ permissions: [permission("excused", saturday, "00:30", "01:00")] });
    const rows = [
      assignment(3, 99, "15:30", "01:00", 540, { breakMinutes: 30 }),
      assignment(4, 12, "05:00", "14:30", 540, { workDate: sunday, breakMinutes: 30 }),
    ];
    const value = buildRosterModel([person], rows, [saturday, sunday], {}, 12).get(7)!;
    expect(value.cells.get(saturday)?.total).toBe(510);
    expect(value.cells.get(sunday)?.total).toBe(540);
    expect(value.planned).toBe(1050);
    expect(value.required).toBe(1050);
  });

  it("excludes annual leave, sickness and weekly rest from the required weekly budget", () => {
    const person = worker({ calendar: [{ date: "2026-10-21", label: "إجازة سنوية" }, { date: "2026-10-22", label: "إجازة مرضية" }] });
    const value = buildRosterModel([person], [], week, {}, 12).get(7)!;
    expect(value.required).toBe(4 * 540);
    expect(value.cells.get("2026-10-21")?.rest).toBe("إجازة سنوية");
    expect(value.cells.get("2026-10-22")?.rest).toBe("إجازة مرضية");
    expect(value.cells.get("2026-10-23")?.rest).toBe("راحة أسبوعية");
    expect(workerRestLabel(person, saturday)).toBe("");
    expect(workerRestLabel(worker({ calendar: [{ date: "2026-10-23", label: "إجازة سنوية" }] }), "2026-10-23")).toBe("إجازة سنوية");
  });

  it("excused and makeup permissions both remove attendance overlap but only excused reduces required hours", () => {
    const rows = [assignment(1, 12, "06:00", "15:30", 540, { breakMinutes: 30 })];
    const excused = buildRosterModel([worker({ permissions: [permission("excused")] })], rows, [saturday], {}, 12).get(7)!;
    const makeup = buildRosterModel([worker({ permissions: [permission("make_up")] })], rows, [saturday], {}, 12).get(7)!;
    expect(excused.planned).toBe(510);
    expect(makeup.planned).toBe(510);
    expect(excused.required).toBe(510);
    expect(makeup.required).toBe(540);
  });

  it("combines split periods, overnight work, both permission modes, annual leave, sickness and weekly rest", () => {
    const person = worker({
      calendar: [{ date: "2026-10-21", label: "إجازة سنوية" }, { date: "2026-10-22", label: "إجازة مرضية" }],
      permissions: [permission("excused", "2026-10-19"), permission("make_up", "2026-10-20")],
    });
    const rows = [
      ...sharedAssignments(),
      assignment(3, 99, "15:30", "01:00", 540, { workDate: sunday, breakMinutes: 30 }),
      assignment(4, 12, "06:00", "15:30", 540, { workDate: "2026-10-19", breakMinutes: 30 }),
      assignment(5, 12, "06:00", "15:30", 540, { workDate: "2026-10-20", breakMinutes: 30 }),
    ];
    for (const owner of [12, 99, undefined]) {
      const value = buildRosterModel([person], rows, week, {}, owner).get(7)!;
      expect(value.planned).toBe(2100);
      expect(value.required).toBe(2130);
      expect(value.required! - value.planned).toBe(30);
      expect(Array.from(value.cells.values()).reduce((sum, cell) => sum + cell.total, 0)).toBe(value.planned);
    }
  });

  it("keeps workers and dates isolated, and preserves an unknown required budget as null", () => {
    const rows = [
      ...sharedAssignments(),
      assignment(8, 12, "05:00", "10:00", 300, { workerId: 8 }),
      assignment(9, 12, "05:00", "10:00", 300, { workDate: "2026-10-24" }),
    ];
    const result = buildRosterModel([worker(), worker({ id: 8, requiredDailyMinutes: null })], rows, [saturday], {}, 12);
    expect(result.get(7)?.planned).toBe(540);
    expect(result.get(8)?.planned).toBe(300);
    expect(result.get(8)?.required).toBeNull();
    expect(result.get(7)?.cells.has("2026-10-24")).toBe(false);
  });

  it("clamps net work and excused required minutes at zero for an absence spanning the whole period", () => {
    const person = worker({ requiredDailyMinutes: 60, permissions: [permission("excused", saturday, "05:00", "10:00", 300)] });
    const value = buildRosterModel([person], [assignment(1, 12, "06:00", "07:00", 60)], [saturday], {}, 12).get(7)!;
    expect(value.planned).toBe(0);
    expect(value.required).toBe(0);
  });
});
