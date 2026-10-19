import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
vi.mock("../../shared/worker-scope", () => ({ assertWorkerInScope: vi.fn(), getScopedWorkerIdsInRange: vi.fn() }));
vi.mock("../schedules/assignments.service", () => ({ recalcTimeBalance: vi.fn() }));
import { getDb } from "../../shared/db";
import { assertWorkerInScope, getScopedWorkerIdsInRange } from "../../shared/worker-scope";
import { attendance, auditLogs, notifications, overtimes, requests, schedulePeriods, shiftAssignments } from "../../../drizzle/schema";
import { actualRegularMinutes, overtimeExtensionMinutes, overrunMinutes, shiftEndInstant } from "./overtime.rules";
import { approvedAttendanceForRange, createOvertime, decideOvertime, listOvertime, overtimePeriodOptions, reopenOvertime, reviewOvertime } from "./overtime.service";
import { assertFinalDecision, assertReopen, auditObject, finalDecisionReason, overtimeSourceSnapshot, wasReopened } from "./overtime-workflow";
import { summarizeWorkBudget } from "../workers/work-budget";

const admin = { id: 1, role: "admin", name: "الأدمن" };
const supervisor = { id: 12, role: "supervisor", name: "مشرف الصباح" };
const workDate = new Date("2026-10-18T00:00:00Z");
const assignment = { id: 11, workerId: 21, supervisorId: 12, periodId: 1, startTime: "06:00:00", endTime: "10:00:00", breakMinutes: 0, plannedMinutes: 240, workDate, status: "planned", costCenterId: 8 };
const request = { id: 5, workerId: 21, assignmentId: 11, overtimeDate: workDate, status: "pending", reviewStatus: "approved", overtimeKind: "planned", originalEndTime: "10:00:00", requestedEndTime: "11:00:00", hours: "1.00", requestedBy: 12 };
const center = { id: 8, code: "T", nameAr: "تولان", nameEn: "Tolan" };
const source = { costCenterId: 8, costCenterName: "تولان", assignmentStartTime: "06:00", assignmentEndTime: "10:00", supervisorId: 12, supervisorName: "مشرف الصباح" };
const sourceEvent = { id: 1, entityId: 5, newValues: JSON.stringify({ stage: "request_created", sourceSnapshot: source, actorName: "مشرف الصباح" }), performedBy: 12, action: "create", reason: "إغلاق المطعم", createdAt: workDate };
const reopenEvent = { ...sourceEvent, id: 2, newValues: JSON.stringify({ stage: "admin_reopen", sourceSnapshot: source, actorName: "الأدمن" }), performedBy: 1, action: "update", reason: "مراجعة الاتفاق" };
const actualPunch = { id: 7, workerId: 21, attendanceDate: workDate, checkInTime: new Date("2026-10-18T06:00:00+03:00"), checkOutTime: new Date("2026-10-18T11:00:00+03:00"), actualHours: "5.00" };
function builder(rows: unknown[]) { const q: any = { then: (resolve: any) => Promise.resolve(rows).then(resolve) }; for (const method of ["from", "where", "for", "innerJoin", "leftJoin", "orderBy"]) q[method] = () => q; return q; }
function mockDatabase(snapshot: unknown[], selects: unknown[][]) {
  const writes: { table: unknown; values: any; type: string }[] = [];
  const tx = {
    select: () => builder(selects.shift() ?? []),
    insert: (table: unknown) => ({ values(values: any) { writes.push({ table, values, type: "insert" }); return { $returningId: async () => [{ id: 5 }], onDuplicateKeyUpdate: async () => undefined, then: (resolve: any) => Promise.resolve(undefined).then(resolve) }; } }),
    update: (table: unknown) => ({ set(values: any) { return { where: async () => { writes.push({ table, values, type: "update" }); } }; } }),
  };
  vi.mocked(getDb).mockResolvedValue({ select: () => builder(snapshot), transaction: (fn: any) => fn(tx) } as any);
  return writes;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(assertWorkerInScope).mockResolvedValue(undefined); vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue(undefined); });

describe("overtime accounting against the official period", () => {
  it("recognizes morning overrun without treating late arrival as official time", () => {
    expect(overrunMinutes(new Date("2026-10-18T11:00:00+03:00"), "2026-10-18", "10:00")).toBe(60);
    expect(actualRegularMinutes(new Date("2026-10-18T07:00:00+03:00"), new Date("2026-10-18T11:00:00+03:00"), [{ workDate: "2026-10-18", startTime: "06:00", endTime: "10:00" }])).toBe(180);
  });
  it("keeps restaurant overtime after midnight in the original operational day", () => {
    expect(overrunMinutes(new Date("2026-10-19T01:30:00+03:00"), "2026-10-18", "01:00")).toBe(30);
    expect(overtimeExtensionMinutes("01:00", "01:30")).toBe(30);
    expect(overtimeExtensionMinutes("01:00", "04:30")).toBe(210);
    expect(shiftEndInstant("2026-10-18", "04:30")).toBe(new Date("2026-10-19T04:30:00+03:00").getTime());
    expect(() => overtimeExtensionMinutes("01:00", "05:00")).toThrow();
  });
  it("reduces excused required minutes but retains a compensation requirement", () => {
    const input = { dates: ["2026-10-18"], dailyMinutes: 540, isWorkingDay: () => true, scheduledByDate: new Map([["2026-10-18", 480]]), actualByDate: new Map([["2026-10-18", 480]]), refDate: "2026-10-18" };
    expect(summarizeWorkBudget({ ...input, excusedMinutesByDate: new Map([["2026-10-18", 60]]) }).remainingMinutes).toBe(0);
    expect(summarizeWorkBudget(input).remainingMinutes).toBe(60);
  });
  it("never approves more than the recorded actual time", async () => {
    const punch = { workerId: 21, id: 7, attendanceDate: workDate, checkInTime: new Date("2026-10-18T06:00:00+03:00"), checkOutTime: new Date("2026-10-18T11:00:00+03:00"), actualHours: "4.00" };
    const responses = [[punch], [assignment], [{ ...request, overtimeKind: "actual", attendanceId: 7, status: "approved" }]];
    vi.mocked(getDb).mockResolvedValue({ select: () => builder(responses.shift() ?? []) } as any);
    expect((await approvedAttendanceForRange(21, "2026-10-18", "2026-10-18")).get("2026-10-18")).toBe(240);
  });
});
describe("two-stage overtime approval", () => {
  it("uses the whole range for a supervisor's overtime listing", async () => {
    vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue([]);
    expect((await listOvertime(supervisor, { fromDate: "2026-10-01", toDate: "2026-10-31" })).items).toEqual([]);
    expect(getScopedWorkerIdsInRange).toHaveBeenCalledWith(supervisor, "2026-10-01", "2026-10-31");
    expect(getDb).not.toHaveBeenCalled();
  });
  it("does not let a worker filter escape the requested date range scope", async () => {
    vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue([22]);
    await expect(listOvertime(supervisor, { workerId: 21, fromDate: "2026-10-01", toDate: "2026-10-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("creates a supervisor's planned request with initial review but does not extend the period", async () => {
    const writes = mockDatabase([assignment], [[{ id: 21 }], [assignment], [center], [{ name: "مشرف الصباح" }], [{ status: "draft" }], [], [{ id: 1 }]]);
    const result = await createOvertime(supervisor, { assignmentId: 11, overtimeKind: "planned", endTime: "11:00", reason: "احتياج تغطية التشغيل" });
    expect(result).toMatchObject({ status: "pending", reviewStatus: "approved" });
    expect(writes.find((w) => w.table === overtimes)?.values.hours).toBe("1.00");
    expect(writes.some((w) => w.table === shiftAssignments)).toBe(false);
  });
  it("prevents a custom HR editor from giving final approval", async () => {
    await expect(decideOvertime({ id: 2, role: "hr_admin", permissions: ["overtime:read", "overtime:create"] }, { id: 5, approved: true, note: "موافقة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("requires supervisor review before HR can approve", async () => {
    const pending = { ...request, reviewStatus: "pending" };
    const writes = mockDatabase([pending], [[{ id: 21 }], [pending]]);
    await expect(decideOvertime(admin, { id: 5, approved: true, note: "اعتماد نهائي" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });
  it("does not let another supervisor review a shared worker's unrelated period", async () => {
    const pending = { ...request, reviewStatus: "pending" };
    const writes = mockDatabase([pending], [[pending], [assignment], [sourceEvent]]);
    await expect(reviewOvertime({ id: 10, role: "supervisor" }, { id: 5, approved: true, note: "قبول أولي" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(writes).toEqual([]);
  });
  it("rejects a stale planned extension if its original period changed", async () => {
    const writes = mockDatabase([request], [[{ id: 21 }], [request], [sourceEvent], [{ ...assignment, endTime: "10:30:00" }]]);
    await expect(decideOvertime(admin, { id: 5, approved: true, note: "اعتماد نهائي" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });
  it("extends the official period only at final approval and requires republication", async () => {
    const writes = mockDatabase([request], [[{ id: 21 }], [request], [sourceEvent], [assignment], [{ id: 1, status: "published" }], [], [], []]);
    await decideOvertime(admin, { id: 5, approved: true, note: "اعتماد تغطية ساعة إضافية" });
    expect(writes.find((w) => w.table === shiftAssignments)?.values).toMatchObject({ endTime: "11:00", plannedMinutes: 300 });
    expect(writes.find((w) => w.table === schedulePeriods)?.values.status).toBe("draft");
    expect(writes.find((w) => w.table === overtimes)?.values.status).toBe("approved");
    expect(writes.some((w) => w.table === attendance)).toBe(false);
  });
  it("rejects an actual overrun without changing the punch or official period", async () => {
    const actual = { ...request, overtimeKind: "actual", reviewStatus: "pending" };
    const writes = mockDatabase([actual], [[actual], [assignment], [sourceEvent]]);
    await reviewOvertime(supervisor, { id: 5, approved: false, note: "لم يكلف العامل بالبقاء" });
    expect(writes.find((w) => w.table === overtimes)?.values).toMatchObject({ status: "rejected", reviewStatus: "rejected" });
    expect(writes.some((w) => w.table === attendance || w.table === shiftAssignments || w.table === requests)).toBe(false);
    expect(writes.some((w) => w.table === auditLogs)).toBe(true);
  });
});

describe("HR refusal and admin reopening", () => {
  const actual = { ...request, overtimeKind: "actual", attendanceId: 7 };
  const rejected = { ...actual, status: "rejected", approvedBy: 17, approvedAt: workDate, decisionNote: "لم يثبت التكليف" };

  it("allows the first HR approval without a reason", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent], [assignment], [actualPunch], []]);
    await decideOvertime(admin, { id: 5, approved: true });
    expect(writes.find((write) => write.table === overtimes)?.values).toMatchObject({ status: "approved", decisionNote: null });
    const event = writes.find((write) => write.table === auditLogs)!;
    expect(auditObject(event.values.newValues)).toMatchObject({ stage: "hr_final", actorName: "الأدمن", sourceSnapshot: source });
    expect(auditObject(event.values.oldValues)).toMatchObject({ status: "pending", reviewStatus: "approved" });
  });

  it("requires an HR refusal reason even for direct service calls", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent]]);
    await expect(decideOvertime(admin, { id: 5, approved: false, note: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it("requires a reason for approval following reopening", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent, reopenEvent]]);
    await expect(decideOvertime(admin, { id: 5, approved: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it("accepts a reasoned HR approval following reopening", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent, reopenEvent], [assignment], [actualPunch], []]);
    await decideOvertime(admin, { id: 5, approved: true, note: "تم التحقق من تكليف العامل" });
    expect(writes.find((write) => write.table === overtimes)?.values).toMatchObject({ status: "approved", decisionNote: "تم التحقق من تكليف العامل" });
    expect(writes.some((write) => write.table === shiftAssignments || write.table === attendance)).toBe(false);
  });

  it("rejects reopening by HR even when all overtime grants are assigned", async () => {
    await expect(reopenOvertime({ id: 17, role: "hr_admin", permissions: ["overtime:*"] }, { id: 5, reason: "إعادة المراجعة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ["supervisor refusal", { ...rejected, reviewStatus: "rejected", approvedBy: null }],
    ["already approved", { ...rejected, status: "approved" }],
    ["already pending", { ...rejected, status: "pending" }],
    ["paid", { ...rejected, status: "paid" }],
  ])("cannot reopen %s", async (_, row) => {
    const writes = mockDatabase([row], [[row]]);
    await expect(reopenOvertime(admin, { id: 5, reason: "مراجعة الاتفاق" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });

  it("preserves refusal details in immutable audit before clearing final fields", async () => {
    const writes = mockDatabase([rejected], [[rejected], [sourceEvent], [assignment]]);
    const result = await reopenOvertime(admin, { id: 5, reason: "تم الاتفاق على إعادة المراجعة" });
    expect(result).toMatchObject({ status: "pending", reviewStatus: "approved", requiresApprovalReason: true });
    expect(writes.find((write) => write.table === overtimes)?.values).toEqual({ status: "pending", approvedBy: null, approvedAt: null, decisionNote: null });
    const event = writes.find((write) => write.table === auditLogs)!;
    expect(auditObject(event.values.oldValues)).toMatchObject({ status: "rejected", approvedBy: 17, decisionNote: "لم يثبت التكليف" });
    expect(auditObject(event.values.newValues)).toMatchObject({ stage: "admin_reopen", actorName: "الأدمن", sourceSnapshot: source });
    expect(writes.filter((write) => write.table === auditLogs)).toHaveLength(1);
    expect(writes.some((write) => write.type === "update" && write.table === auditLogs)).toBe(false);
    expect(writes.some((write) => write.table === attendance || write.table === shiftAssignments)).toBe(false);
    expect(writes.filter((write) => write.table === notifications).map((write) => write.values.userId)).toEqual(expect.arrayContaining([12, 17]));
  });

  it("notifies the period supervisor with the HR refusal reason", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent], [assignment]]);
    await decideOvertime(admin, { id: 5, approved: false, note: "لم يقدم دليل التكليف" });
    expect(writes.find((write) => write.table === notifications && write.values.userId === 12)?.values).toMatchObject({ message: "الطلب #5: لم يقدم دليل التكليف", actionUrl: "/overtime" });
    expect(writes.some((write) => write.table === attendance || write.table === shiftAssignments)).toBe(false);
  });

  it("cannot repeat a final approval or apply a planned extension twice", async () => {
    const approved = { ...request, status: "approved" };
    const writes = mockDatabase([approved], [[{ id: 21 }], [approved]]);
    await expect(decideOvertime(admin, { id: 5, approved: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });

  it("does not approve actual minutes no longer supported by a corrected punch", async () => {
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent], [assignment], [{ ...actualPunch, checkOutTime: new Date("2026-10-18T10:30:00+03:00") }]]);
    await expect(decideOvertime(admin, { id: 5, approved: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });

  it("prevents counting overtime which overlaps another official period", async () => {
    const next = { ...assignment, id: 22, startTime: "10:30:00", endTime: "12:00:00" };
    const writes = mockDatabase([actual], [[{ id: 21 }], [actual], [sourceEvent], [assignment], [actualPunch], [next]]);
    await expect(decideOvertime(admin, { id: 5, approved: true })).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("نفس الوقت مرتين") });
    expect(writes).toEqual([]);
  });
});

describe("actual destination and minimal permission scope", () => {
  function reads(responses: unknown[][]) {
    vi.mocked(getDb).mockResolvedValue({ select: () => builder(responses.shift() ?? []) } as any);
  }
  const scopedHR = { id: 17, role: "hr_admin", name: "الشؤون", permissions: ["overtime:read", "overtime:approve"], accessScope: { costCenterIds: [8] } };

  it("lists the actual destination for a shared worker instead of the primary center", async () => {
    reads([[{ overtime: request, name: "عامل مشترك", employeeId: "W21", assignment, primaryBranch: "M" }], [], [], [center, { id: 9, code: "M", nameAr: "الملقا" }], [{ id: 12, name: "مشرف الصباح" }], [sourceEvent]]);
    const data = await listOvertime(scopedHR, { fromDate: "2026-10-18", toDate: "2026-10-18" });
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ costCenterId: 8, costCenterName: "تولان", supervisorName: "مشرف الصباح", totalMinutes: 60, canDecide: true });
    expect(data.items[0].history[0]).toMatchObject({ actorName: "مشرف الصباح", stage: "request_created" });
    expect(data.centers.map((entry) => entry.id)).toEqual([8]);
    expect(getScopedWorkerIdsInRange).toHaveBeenCalledWith({ ...scopedHR, accessScope: null }, "2026-10-18", "2026-10-18");
  });

  it("keeps an existing request charged to its original center after the worker and period change", async () => {
    reads([[{ overtime: request, name: "عامل مشترك", employeeId: "W21", assignment: { ...assignment, costCenterId: 9 }, primaryBranch: "M" }], [], [], [center, { id: 9, code: "M", nameAr: "الملقا" }], [], [sourceEvent]]);
    const data = await listOvertime(scopedHR, { fromDate: "2026-10-18", toDate: "2026-10-18" });
    expect(data.items[0]).toMatchObject({ costCenterId: 8, costCenterName: "تولان" });
  });

  it("hides unrelated center requests even if the worker's primary center is allowed", async () => {
    reads([[{ overtime: request, name: "عامل", employeeId: "W21", assignment, primaryBranch: "M" }], [], [], [center], [], [sourceEvent]]);
    expect((await listOvertime({ ...scopedHR, accessScope: { costCenterIds: [9] } }, { fromDate: "2026-10-18", toDate: "2026-10-18" })).items).toEqual([]);
  });

  it("denies a final decision outside the request's snapshotted center", async () => {
    const writes = mockDatabase([request], [[{ id: 21 }], [request], [sourceEvent], [assignment]]);
    await expect(decideOvertime({ ...scopedHR, accessScope: { costCenterIds: [9] } }, { id: 5, approved: false, note: "سبب الرفض" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(writes).toEqual([]);
  });

  it("provides minimal existing period options with only overtime:create permission", async () => {
    reads([[{ assignment, name: "عامل مشترك", employeeId: "W21", primaryBranch: "M" }], [center], [{ id: 12, name: "مشرف الصباح" }]]);
    const result = await overtimePeriodOptions({ ...scopedHR, permissions: ["overtime:create"] }, { workDate: "2026-10-18" });
    expect(result.items).toEqual([expect.objectContaining({ id: 11, workerId: 21, costCenterId: 8, name: "عامل مشترك", startTime: "06:00", endTime: "10:00" })]);
  });

  it("uses the worker primary center only for a legacy period without an actual center", async () => {
    reads([[{ assignment: { ...assignment, costCenterId: null }, name: "عامل قديم", employeeId: "W21", primaryBranch: "T" }], [center], []]);
    const result = await overtimePeriodOptions({ ...scopedHR, permissions: ["overtime:create"] }, { workDate: "2026-10-18" });
    expect(result.items[0]?.costCenterId).toBe(8);
  });
});

describe("workflow reason and audit helpers", () => {
  it("distinguishes first approval, refusal, and reapproval reason rules", () => {
    expect(finalDecisionReason(true, undefined, false)).toBeNull();
    expect(() => finalDecisionReason(false, undefined, false)).toThrow();
    expect(() => finalDecisionReason(true, undefined, true)).toThrow();
    expect(finalDecisionReason(true, "تم التحقق", true)).toBe("تم التحقق");
  });
  it("retains the first destination snapshot and tolerates legacy JSON encodings", () => {
    const first = { newValues: JSON.stringify({ sourceSnapshot: source }) };
    const changed = { newValues: { sourceSnapshot: { ...source, costCenterId: 9 } } };
    expect(overtimeSourceSnapshot([first, changed])).toEqual(source);
    expect(auditObject("invalid")).toEqual({});
    expect(wasReopened([reopenEvent])).toBe(true);
    expect(wasReopened([sourceEvent])).toBe(false);
  });
  it("guards terminal decisions and reopening roles without database access", () => {
    expect(() => assertFinalDecision({ status: "approved", reviewStatus: "approved" })).toThrow();
    expect(() => assertReopen({ role: "hr_admin" }, { status: "rejected", reviewStatus: "approved", approvedBy: 17 })).toThrow();
    expect(() => assertReopen(admin, { status: "rejected", reviewStatus: "approved", approvedBy: 17 })).not.toThrow();
  });
});
