import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getTableName, type SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), absences: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
vi.mock("../leaves/approved-absence", () => ({ approvedAbsencesForWorkers: mocks.absences }));
import { getWeeklyBoardComplete, getWeeklyBoardExport, getWeeklyBoardPage, normalizeWeeklyPage, weeklyWorkerFilterCondition, weeklyWorkerScopeCondition } from "./weekly-board-page.service";
const centers = [{ id: 1, code: "FOOD", nameAr: "المطاعم", isActive: true }, { id: 2, code: "OFFICE", nameAr: "الإدارة", isActive: true }];
const dialect = new MySqlDialect();
const compile = (condition: SQL) => dialect.sqlToQuery(condition);
const week = "2026-10-18", end = "2026-10-24";
const row = { worker: { id: 7, nameAr: "كوكن", employeeId: "EMP7", departmentId: 6, locationId: 22, jobTitleId: 32 }, settings: { branch: "2", requiredHoursPerDay: "9", weeklyRestDay: 5 }, departmentName: "المكتب" };
const sites = [{ id: 11, nameAr: "مطعم", isActive: true }, { id: 22, nameAr: "مكتب", isActive: true }];
const depts = [{ id: 5, nameAr: "كاشير", isActive: true }, { id: 6, nameAr: "المكتب", isActive: true }];
const jobs = [{ id: 31, titleAr: "كاشير", departmentId: 5, isActive: true }, { id: 32, titleAr: "بوفيه", departmentId: 6, isActive: true }];
const assignments = [
  { id: 1, workerId: 7, supervisorId: 12, costCenterId: 2, locationId: 22, departmentId: 6, jobTitleId: 32, workDate: week, startTime: "07:00:00", endTime: "14:00:00", plannedMinutes: 420 },
  { id: 2, workerId: 7, supervisorId: 99, costCenterId: 1, locationId: 11, departmentId: 5, jobTitleId: 31, workDate: week, startTime: "19:00:00", endTime: "00:30:00", plannedMinutes: 330 },
];
type QueryRecord = { table: string; fields?: any; condition?: SQL; limit?: number; offset?: number };
function fixture(selected: any[] = [row], overrides: Record<string, any[]> = {}) {
  const records: QueryRecord[] = [];
  const values: Record<string, any[]> = {
    branches: centers, locations: sites, departments: depts, job_titles: jobs,
    branch_locations: [{ branchId: 1, locationId: 11 }, { branchId: 2, locationId: 22 }],
    location_departments: [{ departmentId: 5, locationId: 11 }, { departmentId: 6, locationId: 22 }],
    shift_assignments: assignments, schedule_periods: [],
    supervisor_assignments: [{ link: { workerId: 7, supervisorId: 12, effectiveFrom: "2026-01-01", effectiveTo: null }, id: 12, name: "مدير المكتب", isActive: true }, { link: { workerId: 7, supervisorId: 99, effectiveFrom: "2026-01-01", effectiveTo: null }, id: 99, name: "مدير المطعم", isActive: true }],
    worker_calendar: [{ entry: { workerId: 7, date: "2026-10-19", requestId: 50 }, code: "ANNUAL_LEAVE", label: "إجازة سنوية" }],
    requests: [{ id: 50, workerId: 7, leaveKind: "annual", status: "approved", startDate: "2026-09-23", endDate: "2026-10-25" }], ...overrides,
  };
  const select = (fields?: any) => {
    const record: QueryRecord = { table: "", fields };
    const chain: any = {
      from(table: any) { record.table = getTableName(table); records.push(record); return chain; },
      where(condition: SQL) { record.condition = condition; return chain; }, innerJoin: () => chain, leftJoin: () => chain, orderBy: () => chain, $dynamic: () => chain,
      limit(limit: number) { record.limit = limit; return chain; }, offset(offset: number) { record.offset = offset; return chain; },
      then(resolve: any, reject: any) { const result = record.table === "workers" ? fields?.count ? [{ count: selected.length }] : fields?.branch ? [{ branch: "2" }] : selected : values[record.table] ?? []; return Promise.resolve(result).then(resolve, reject); },
    }; return chain;
  };
  mocks.getDb.mockResolvedValue({ select, selectDistinct: select }); return records;
}
describe("server-paged destination-aware weekly roster", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.absences.mockResolvedValue(new Map()); });
  it("rejects invalid weeks, pages, IDs and grants before database reads", async () => {
    expect(normalizeWeeklyPage()).toMatchObject({ offset: 0, limit: 32 });
    for (const input of [{ limit: 101 }, { offset: -1 }, { workerIds: [], search: "x".repeat(101) }]) await expect(getWeeklyBoardPage({ id: 1, role: "admin" }, week, input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getWeeklyBoardPage({ id: 1, role: "admin" }, "2026-10-17")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getWeeklyBoardPage({ id: 2, role: "guard", permissions: [] }, week)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getWeeklyBoardExport({ id: 2, role: "hr_admin", permissions: ["schedule:read"] }, week)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("allows linked supervisors across primary centers without broadening their links", () => {
    const query = compile(weeklyWorkerScopeCondition({ id: 12, role: "supervisor", accessScope: { costCenterIds: [1] } }, centers, week, end));
    expect(query.sql).toContain("`supervisor_assignments`.`workerId` = `workers`.`id`"); expect(query.params).toContain(12); expect(query.params).toContain(end);
    expect(query.sql).not.toContain("`worker_schedule_settings`.`branch` in");
    expect(compile(weeklyWorkerScopeCondition({ id: 12, role: "supervisor", accessScope: { costCenterIds: [] } }, centers, week, end)).sql).toContain("1 = 0");
  });
  it("limits scoped accounts to primary or actual centers and worker accounts to themselves", () => {
    const query = compile(weeklyWorkerScopeCondition({ id: 2, role: "hr_admin", accessScope: { costCenterIds: [1] } }, centers, week, end));
    expect(query.sql).toContain("`worker_schedule_settings`.`branch` in"); expect(query.sql).toContain("`shift_assignments`.`costCenterId` in"); expect(query.params).not.toContain("OFFICE");
    const self = compile(weeklyWorkerScopeCondition({ id: 25, role: "worker" }, centers, week, end)); expect(self.sql).toContain("`workers`.`userId` = ?"); expect(self.params).toContain(25);
  });
  it("filters actual periods, falling back to primary only when unassigned", () => {
    const query = compile(weeklyWorkerFilterCondition({ center: "المطاعم", search: "%EMP_7", workerIds: [7] }, centers, week, end, "export")!);
    expect(query.sql).toContain("not exists"); expect(query.sql).toContain("`shift_assignments`.`costCenterId` = ?"); expect(query.sql.match(/locate\(/g)).toHaveLength(5); expect(query.sql).not.toContain(" like "); expect(query.params).toContain("%emp_7");
    expect(compile(weeklyWorkerFilterCondition({ workerIds: [] }, centers)!).sql).toBe("1 = 0");
  });
  it("keeps primary workers eligible while planning and linked shared workers eligible before their first destination shift", () => {
    const planning = compile(weeklyWorkerFilterCondition({ center: "المطاعم" }, centers, week, end)!);
    expect(planning.sql).toContain("`worker_schedule_settings`.`branch` in");
    expect(planning.sql).toContain("`shift_assignments`.`costCenterId` = ?");
    expect(planning.sql).not.toContain("not exists");
    const linkedCandidates = weeklyWorkerFilterCondition({ center: "المطاعم" }, centers, week, end, "planning", true);
    expect(linkedCandidates).toBeUndefined();
    const scope = compile(weeklyWorkerScopeCondition({ id: 12, role: "supervisor", accessScope: { costCenterIds: [1] } }, centers, week, end));
    expect(scope.sql).toContain("`supervisor_assignments`.`supervisorId` = ?");
    expect(scope.params).toContain(12);
  });
  it("applies identical SQL before paging/counts and retains both jobs for unified hours", async () => {
    const records = fixture(); const board = await getWeeklyBoardPage({ id: 12, role: "supervisor", accessScope: { costCenterIds: [1] } }, week, { center: "المطاعم", offset: 32 });
    const reads = records.filter((record) => record.table === "workers"); expect(compile(reads[0].condition!)).toEqual(compile(reads[1].condition!)); expect(reads[0]).toMatchObject({ limit: 32, offset: 32 });
    expect(board.assignments.map((item) => item.jobTitleName)).toEqual(["بوفيه", "كاشير"]); expect(board.assignments.reduce((sum, item) => sum + item.plannedMinutes, 0)).toBe(750);
    expect(board.destinations.centers.map((center) => center.id)).toEqual([1]); expect(board.workers[0]).toMatchObject({ costCenterId: 2, locationId: 22, jobTitleId: 32, jobTitleName: "بوفيه" });
    expect(board.workers[0].calendar[0]).toMatchObject({ label: "إجازة سنوية V27", annualLeaveDay: 27, annualLeaveStartDate: "2026-09-23" });
  });
  it("exports all selected-center periods and true destinations without page truncation", async () => {
    const records = fixture(); const board = await getWeeklyBoardExport({ id: 1, role: "admin" }, week, { center: "المطاعم" });
    expect(records.find((record) => record.fields?.worker)?.limit).toBeUndefined(); expect(board.assignments).toHaveLength(1);
    expect(board.assignments[0]).toMatchObject({ costCenterId: 1, locationId: 11, departmentId: 5, jobTitleId: 31, jobTitleName: "كاشير", supervisorName: "مدير المطعم" });
  });
  it("denies a forged center filter or export outside a scoped supervisor's destination grant", async () => {
    fixture();
    const actor = { id: 12, role: "supervisor", permissions: ["schedule:read", "schedule:export"], accessScope: { costCenterIds: [1] } };
    await expect(getWeeklyBoardPage(actor, week, { center: "الإدارة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getWeeklyBoardExport(actor, week, { center: "2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires a single known center for export, including scoped HR calls that omit the UI filter", async () => {
    const actor = { id: 2, role: "hr_admin", permissions: ["schedule:read", "schedule:export"], accessScope: { costCenterIds: [1] } };
    await expect(getWeeklyBoardExport(actor, week)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getWeeklyBoardExport(actor, week, { center: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    fixture();
    await expect(getWeeklyBoardExport({ id: 1, role: "admin" }, week, { center: "غير موجود" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("reads an explicitly empty saved restaurant task without restoring the primary office task", async () => {
    fixture([row], { shift_assignments: [{ ...assignments[1], jobTitleId: null }] });
    const board = await getWeeklyBoardPage({ id: 1, role: "admin" }, week);
    expect(board.assignments[0]).toMatchObject({ costCenterId: 1, departmentId: 5, jobTitleId: null, jobTitleName: "مهمة غير محددة" });
  });
  it("resolves legacy destinations and uses identical complete-board scope", async () => {
    fixture([row], { shift_assignments: [{ ...assignments[0], costCenterId: null, locationId: null, jobTitleId: null }] });
    const board = await getWeeklyBoardComplete({ id: 1, role: "admin" }, week); expect(board.assignments[0]).toMatchObject({ costCenterId: 2, locationId: 22, jobTitleId: 32 });
  });
  it("does not load assignments or calendars for an empty page", async () => {
    const records = fixture([]); const board = await getWeeklyBoardPage({ id: 1, role: "admin" }, week); expect(board.workers).toEqual([]); expect(board.assignments).toEqual([]);
    expect(records.some((record) => ["shift_assignments", "worker_calendar"].includes(record.table))).toBe(false); expect(mocks.absences).not.toHaveBeenCalled();
  });
});
