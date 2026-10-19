import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaveDates, leaveInputSchema, operationalMinute, permissionMinutes, requestsOverlap, requestTransition } from "./leaves.rules";
import { permissionOverlapMinutes } from "./approved-absence";
vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
vi.mock("../../shared/worker-scope", () => ({ assertWorkerInScope: vi.fn(), getScopedWorkerIdsInRange: vi.fn() }));
vi.mock("../schedules/assignments.service", () => ({ recalcTimeBalance: vi.fn() }));
import { getDb } from "../../shared/db";
import { assertWorkerInScope, getScopedWorkerIdsInRange } from "../../shared/worker-scope";
import { cancelLeave, decideLeave, listLeaves, saveLeave } from "./leaves.service";
import { attendance, auditLogs, requests, shiftAssignments, workerCalendar } from "../../../drizzle/schema";

const admin = { id: 1, role: "admin" };
const input = { workerId: 21, leaveKind: "annual" as const, startDate: "2026-10-20", endDate: "2026-11-13", reason: "إجازة سنوية للتجربة" };
const request = { ...input, id: 44, startDate: new Date("2026-10-20T00:00:00Z"), endDate: new Date("2026-11-13T00:00:00Z"), status: "pending", submittedBy: 2 };
function mockDatabase(snapshot: unknown[], selects: unknown[][]) {
  const writes: { table: unknown; values: any; type: string }[] = [];
  const builder = (rows: unknown[]) => {
    const query: any = { then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); } };
    for (const name of ["from", "where", "for", "innerJoin", "orderBy", "limit"]) query[name] = () => query;
    return query;
  };
  const tx = {
    select: vi.fn(() => builder(selects.shift() ?? [])),
    insert: (table: unknown) => ({ values(values: any) { writes.push({ table, values, type: "insert" }); return { $returningId: async () => [{ id: 44 }], onDuplicateKeyUpdate: async () => undefined, then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) }; } }),
    update: (table: unknown) => ({ set(values: any) { return { where: async () => { writes.push({ table, values, type: "update" }); } }; } }),
    delete: (table: unknown) => ({ where: async (values: any) => { writes.push({ table, values, type: "delete" }); } }),
  };
  const db = { select: () => builder(snapshot), transaction: (fn: (tx: any) => unknown) => fn(tx) };
  vi.mocked(getDb).mockResolvedValue(db as any);
  return writes;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue(undefined); vi.mocked(assertWorkerInScope).mockResolvedValue(undefined); });

describe("leave and permission operational rules", () => {
  it("supports a 25-day annual leave crossing months and weeks", () => {
    expect(leaveInputSchema.parse(input)).toEqual(input);
    expect(leaveDates(input.startDate, input.endDate)).toHaveLength(25);
    expect(leaveDates(input.startDate, input.endDate).at(-1)).toBe("2026-11-13");
  });
  it("rejects impossible civil dates and inverted date ranges", () => {
    expect(leaveInputSchema.safeParse({ ...input, startDate: "2026-02-30" }).success).toBe(false);
    expect(leaveInputSchema.safeParse({ ...input, endDate: "2026-10-19" }).success).toBe(false);
  });
  it("keeps an after-midnight permission on the same operational day", () => {
    expect(operationalMinute("00:30")).toBe(1470);
    expect(permissionMinutes("23:30", "01:00")).toBe(90);
    expect(leaveInputSchema.safeParse({ ...input, leaveKind: "permission", endDate: input.startDate, startTime: "23:30", endTime: "01:00" }).success).toBe(true);
    expect(permissionMinutes("01:00", "04:30")).toBe(210);
    expect(leaveInputSchema.safeParse({ ...input, leaveKind: "permission", endDate: input.startDate, startTime: "01:00", endTime: "04:30" }).success).toBe(true);
  });
  it("rejects permissions crossing the 04:30 operational boundary or spanning dates", () => {
    expect(leaveInputSchema.safeParse({ ...input, leaveKind: "permission", endDate: input.startDate, startTime: "04:00", endTime: "05:00" }).success).toBe(false);
    expect(leaveInputSchema.safeParse({ ...input, leaveKind: "permission", startTime: "08:00", endTime: "09:00" }).success).toBe(false);
  });
  it("detects overlaps but allows adjacent partial permissions", () => {
    const a = { leaveKind: "permission", startDate: "2026-10-20", endDate: "2026-10-20", startTime: "08:00", endTime: "09:00" };
    expect(requestsOverlap(a, { ...a, startTime: "08:30", endTime: "10:00" })).toBe(true);
    expect(requestsOverlap(a, { ...a, startTime: "09:00", endTime: "10:00" })).toBe(false);
    expect(requestsOverlap(a, { ...a, leaveKind: "sick" })).toBe(true);
    expect(permissionOverlapMinutes("16:00", "01:00", [{ startTime: "00:30", endTime: "01:30" }])).toBe(30);
  });
  it("requires pending approval and preserves approved history through cancellation", () => {
    expect(requestTransition("approved", "approve")).toBe(false);
    expect(requestTransition("rejected", "edit")).toBe(false);
    expect(requestTransition("approved", "cancel")).toBe(true);
    expect(requestTransition("cancelled", "cancel")).toBe(false);
  });
});
describe("leave workflow writes and access", () => {
  it("blocks a custom HR account without leave approval before any database query", async () => {
    await expect(decideLeave({ id: 2, role: "hr_admin", permissions: ["leave:read"] }, { requestId: 44, approved: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("returns no workers for an empty HR center scope", async () => {
    vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue([]);
    const result = await listLeaves(admin, { fromDate: "2026-10-01", toDate: "2026-11-30" });
    expect(result.items).toEqual([]); expect(getDb).not.toHaveBeenCalled();
  });
  it("checks the whole requested date range when listing a worker's leave", async () => {
    vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue([21]);
    mockDatabase([], []);
    await listLeaves(admin, { workerId: 21, fromDate: "2026-10-01", toDate: "2026-11-30" });
    expect(getScopedWorkerIdsInRange).toHaveBeenCalledWith(admin, "2026-10-01", "2026-11-30");
    expect(assertWorkerInScope).not.toHaveBeenCalled();
  });
  it("rejects a specific worker outside the list range scope before querying requests", async () => {
    vi.mocked(getScopedWorkerIdsInRange).mockResolvedValue([22]);
    await expect(listLeaves(admin, { workerId: 21, fromDate: "2026-10-01", toDate: "2026-11-30" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("checks worker scope before creating a pending request", async () => {
    vi.mocked(assertWorkerInScope).mockRejectedValue(new Error("outside scope"));
    await expect(saveLeave(admin, input)).rejects.toThrow("outside scope");
    expect(getDb).not.toHaveBeenCalled();
  });
  it("approves 25 days, cancels only planned/confirmed assignments and never writes punches", async () => {
    const assignments = [{ id: 1, supervisorId: 4, status: "planned" }, { id: 2, supervisorId: 5, status: "completed" }];
    const writes = mockDatabase([request], [[{ id: 21 }], [request], assignments, [], [{ id: 1 }], [{ supervisorId: 4 }, { supervisorId: 5 }]]);
    const result = await decideLeave(admin, { requestId: 44, approved: true });
    expect(result.affectedAssignments).toBe(2);
    expect(writes.find((w) => w.table === workerCalendar)?.values).toHaveLength(25);
    expect(writes.find((w) => w.table === shiftAssignments)?.values.status).toBe("cancelled");
    expect(writes.filter((w) => w.table === auditLogs).flatMap((w) => w.values).some((w: any) => w.entityType === "shift_assignment" && w.entityId === 2)).toBe(false);
    expect(writes.some((w) => w.table === attendance)).toBe(false);
    expect(writes.find((w) => w.table === requests)?.values.status).toBe("approved");
  });
  it("rejects repeat decisions without writing calendar or changing shifts", async () => {
    const approved = { ...request, status: "approved" };
    const writes = mockDatabase([approved], [[{ id: 21 }], [approved]]);
    await expect(decideLeave(admin, { requestId: 44, approved: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });
  it("requires a reason on rejection and an explicit waiver/compensation choice", async () => {
    await expect(decideLeave(admin, { requestId: 44, approved: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const permission = { ...request, leaveKind: "permission" };
    mockDatabase([permission], [[{ id: 21 }], [permission]]);
    await expect(decideLeave(admin, { requestId: 44, approved: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("cancels approval through linked calendar rows without restoring or deleting original shifts/punches", async () => {
    const approved = { ...request, status: "approved" };
    const writes = mockDatabase([approved], [[{ id: 21 }], [approved], [{ supervisorId: 4 }]]);
    await cancelLeave(admin, { requestId: 44, reason: "عودة مبكرة من الإجازة" });
    expect(writes.find((w) => w.table === requests)?.values.status).toBe("cancelled");
    expect(writes.some((w) => w.table === workerCalendar && w.type === "delete")).toBe(true);
    expect(writes.some((w) => w.table === attendance || w.table === shiftAssignments)).toBe(false);
  });
});
