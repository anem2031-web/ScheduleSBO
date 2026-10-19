import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { attendance, auditLogs, branches, dayTypes, notifications, overtimes, overtimeReasons, schedulePeriods, shiftAssignments, users, workerCalendar, workers, workerScheduleSettings, type User } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { calendarOnOrAfter, calendarOnOrBefore, calendarEquals } from "../../shared/calendar-date-sql";
import { assertWorkerInScope, getScopedWorkerIdsInRange } from "../../shared/worker-scope";
import { hasPermission, isCostCenterAllowed } from "../../shared/rbac";
import { addCalendarDays, assertOperationalInterval } from "../../../shared/weekly-schedule";
import { findConflict } from "../schedules/assignments.conflict";
import { recalcTimeBalance } from "../schedules/assignments.service";
import { validateApprovedPermissionOverlap } from "../leaves/approved-absence";
import { actualRegularMinutes, overtimeExtensionMinutes, overrunMinutes, shiftEndInstant, shiftInstant } from "./overtime.rules";
import { riyadhParts } from "../../../shared/operational-day";
import { assertFinalDecision, assertReopen, auditObject, finalDecisionReason, overtimeReason, overtimeSourceSnapshot, wasReopened, type OvertimeDestination, type OvertimePeriodSnapshot } from "./overtime-workflow";
type Actor = Pick<User, "id" | "role"> & { name?: string | null; permissions?: string[]; accessScope?: { costCenterIds: number[] } | null };
const key = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const active = ["planned", "confirmed", "completed"] as const;
function requirePermission(actor: Actor, permission: string) { if (!hasPermission(actor as User, permission)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية تنفيذ هذا الإجراء على زيادة الساعات" }); }
async function database() { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" }); return db; }
function owner(actor: Actor, supervisorId: number) { if (actor.role === "supervisor" && actor.id !== supervisorId) throw new TRPCError({ code: "FORBIDDEN", message: "مراجعة الزيادة لدى مشرف الفترة المسؤول عنها" }); }
type Reader = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;
type Assignment = typeof shiftAssignments.$inferSelect;
type Source = OvertimeDestination & OvertimePeriodSnapshot;
const linkedScopeActor = (actor: Actor): Actor => actor.accessScope && actor.role !== "worker" ? { ...actor, accessScope: null } : actor;
async function actorName(db: Reader, actor: Actor) {
  if (actor.name) return actor.name;
  const [user] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, actor.id));
  return user?.name || user?.username || `مستخدم #${actor.id}`;
}
async function sourceForAssignment(db: Reader, assignment: Assignment): Promise<Source> {
  let centerId = assignment.costCenterId;
  const [centers, people] = await Promise.all([
    db.select({ id: branches.id, code: branches.code, nameAr: branches.nameAr }).from(branches),
    db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, assignment.supervisorId)),
  ]);
  if (centerId == null) {
    const [settings] = await db.select({ branch: workerScheduleSettings.branch }).from(workerScheduleSettings).where(eq(workerScheduleSettings.workerId, assignment.workerId));
    centerId = centers.find((center) => [String(center.id), center.code, center.nameAr].includes(String(settings?.branch ?? "")))?.id ?? null;
  }
  return { costCenterId: centerId ?? null, costCenterName: centers.find((center) => center.id === centerId)?.nameAr ?? "مركز غير محدد", assignmentStartTime: assignment.startTime.slice(0, 5), assignmentEndTime: assignment.endTime.slice(0, 5), supervisorId: assignment.supervisorId, supervisorName: people[0]?.name || people[0]?.username || `مشرف #${assignment.supervisorId}` };
}
async function assertSourceScope(actor: Actor, workerId: number, workDate: string, source: Source) {
  // A shared worker's primary center does not grant access to another period's costs.
  if (actor.role === "supervisor" || actor.role === "worker") await assertWorkerInScope(linkedScopeActor(actor), workerId, workDate);
  if (!isCostCenterAllowed(actor, source.costCenterId)) throw new TRPCError({ code: "FORBIDDEN", message: "زيادة هذه الفترة خارج مراكز التكلفة المسموحة لك" });
  if (actor.role === "supervisor") owner(actor, source.supervisorId ?? -1);
}
async function overtimeEvents(db: Reader, id: number) {
  return db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "overtime"), eq(auditLogs.entityId, id))).orderBy(auditLogs.id);
}
/** Minimal selector data is authorized by overtime:create; it does not require worker or schedule browsing grants. */
export async function overtimePeriodOptions(actor: Actor, input: { workDate: string; workerId?: number }) {
  requirePermission(actor, "overtime:create");
  const ids = await getScopedWorkerIdsInRange(linkedScopeActor(actor), input.workDate, input.workDate);
  if (input.workerId && ids && !ids.includes(input.workerId)) throw new TRPCError({ code: "FORBIDDEN", message: "العامل خارج نطاق صلاحيات حسابك" });
  if (ids && !ids.length) return { items: [], centers: [] };
  const db = await database();
  const [entries, centers, people] = await Promise.all([
    db.select({ assignment: shiftAssignments, name: workers.nameAr, employeeId: workers.employeeId, primaryBranch: workerScheduleSettings.branch }).from(shiftAssignments).innerJoin(workers, eq(workers.id, shiftAssignments.workerId)).innerJoin(schedulePeriods, eq(schedulePeriods.id, shiftAssignments.periodId)).leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, shiftAssignments.workerId)).where(and(calendarEquals(shiftAssignments.workDate, date(input.workDate)), inArray(shiftAssignments.status, ["planned", "confirmed"]), inArray(schedulePeriods.status, ["draft", "published"]), input.workerId ? eq(shiftAssignments.workerId, input.workerId) : ids ? inArray(shiftAssignments.workerId, ids) : undefined, actor.role === "supervisor" ? eq(shiftAssignments.supervisorId, actor.id) : undefined)),
    db.select({ id: branches.id, code: branches.code, nameAr: branches.nameAr, nameEn: branches.nameEn }).from(branches),
    db.select({ id: users.id, name: users.name, username: users.username }).from(users),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name || person.username || `مشرف #${person.id}`]));
  const items = entries.flatMap(({ assignment, name, employeeId, primaryBranch }) => {
    const costCenterId = assignment.costCenterId ?? centers.find((center) => [String(center.id), center.code, center.nameAr].includes(String(primaryBranch ?? "")))?.id ?? null;
    if (!isCostCenterAllowed(actor, costCenterId) || (actor.role === "supervisor" && assignment.supervisorId !== actor.id)) return [];
    return [{ id: assignment.id, workerId: assignment.workerId, name, employeeId, startTime: assignment.startTime.slice(0, 5), endTime: assignment.endTime.slice(0, 5), breakMinutes: assignment.breakMinutes, workDate: key(assignment.workDate), supervisorId: assignment.supervisorId, supervisorName: names.get(assignment.supervisorId) ?? `مشرف #${assignment.supervisorId}`, costCenterId, costCenterName: centers.find((center) => center.id === costCenterId)?.nameAr ?? "مركز غير محدد" }];
  });
  return { items, centers: centers.filter((center) => isCostCenterAllowed(actor, center.id)).map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn })) };
}
export async function listOvertime(actor: Actor, input: { workerId?: number; fromDate: string; toDate: string }) {
  requirePermission(actor, "overtime:read");
  if (input.toDate < input.fromDate || input.toDate > addCalendarDays(input.fromDate, 93)) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر مدة لا تتجاوز 93 يومًا" });
  const scopedIds = await getScopedWorkerIdsInRange(linkedScopeActor(actor), input.fromDate, input.toDate);
  if (input.workerId && scopedIds && !scopedIds.includes(input.workerId)) throw new TRPCError({ code: "FORBIDDEN", message: "العامل خارج نطاق صلاحيات حسابك خلال المدة المطلوبة" });
  const ids = input.workerId ? [input.workerId] : scopedIds;
  const capabilities = { canCreate: hasPermission(actor as User, "overtime:create"), canReview: hasPermission(actor as User, "overtime:review"), canApprove: hasPermission(actor as User, "overtime:approve"), canReopen: actor.role === "admin" };
  if (ids && !ids.length) return { items: [], candidates: [], centers: [], ...capabilities };
  const db = await database();
  const [records, punches, assignments, centers, people] = await Promise.all([
    db.select({ overtime: overtimes, name: workers.nameAr, employeeId: workers.employeeId, assignment: shiftAssignments, primaryBranch: workerScheduleSettings.branch }).from(overtimes).innerJoin(workers, eq(workers.id, overtimes.workerId)).leftJoin(shiftAssignments, eq(shiftAssignments.id, overtimes.assignmentId)).leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id)).where(and(calendarOnOrAfter(overtimes.overtimeDate, date(input.fromDate)), calendarOnOrBefore(overtimes.overtimeDate, date(input.toDate)), ids ? inArray(overtimes.workerId, ids) : undefined)).orderBy(desc(overtimes.createdAt)),
    db.select({ punch: attendance, name: workers.nameAr, employeeId: workers.employeeId }).from(attendance).innerJoin(workers, eq(workers.id, attendance.workerId)).where(and(calendarOnOrAfter(attendance.attendanceDate, date(input.fromDate)), calendarOnOrBefore(attendance.attendanceDate, date(input.toDate)), ids ? inArray(attendance.workerId, ids) : undefined)),
    db.select({ assignment: shiftAssignments, primaryBranch: workerScheduleSettings.branch }).from(shiftAssignments).leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, shiftAssignments.workerId)).where(and(calendarOnOrAfter(shiftAssignments.workDate, date(input.fromDate)), calendarOnOrBefore(shiftAssignments.workDate, date(input.toDate)), inArray(shiftAssignments.status, [...active]), ids ? inArray(shiftAssignments.workerId, ids) : undefined)),
    db.select({ id: branches.id, code: branches.code, nameAr: branches.nameAr, nameEn: branches.nameEn }).from(branches),
    db.select({ id: users.id, name: users.name, username: users.username }).from(users),
  ]);
  const events = records.length ? await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "overtime"), inArray(auditLogs.entityId, records.map(({ overtime }) => overtime.id)))).orderBy(auditLogs.id) : [];
  const eventsById = new Map<number, typeof events>();
  for (const event of events) { const bucket = eventsById.get(event.entityId) ?? []; bucket.push(event); eventsById.set(event.entityId, bucket); }
  const names = new Map(people.map((person) => [person.id, person.name || person.username || `مستخدم #${person.id}`]));
  const personName = (id: number | null) => id == null ? null : names.get(id) ?? `مستخدم #${id}`;
  const source = (assignment: Assignment | null, primaryBranch: string | null): Source => {
    const centerId = assignment?.costCenterId ?? centers.find((center) => [String(center.id), center.code, center.nameAr].includes(String(primaryBranch ?? "")))?.id ?? null;
    return { costCenterId: centerId, costCenterName: centers.find((center) => center.id === centerId)?.nameAr ?? "مركز غير محدد", assignmentStartTime: assignment?.startTime.slice(0, 5) ?? null, assignmentEndTime: assignment?.endTime.slice(0, 5) ?? null, supervisorId: assignment?.supervisorId ?? null, supervisorName: personName(assignment?.supervisorId ?? null) };
  };
  const allowed = (value: Source) => isCostCenterAllowed(actor, value.costCenterId) && (actor.role !== "supervisor" || value.supervisorId === actor.id);
  const items = records.flatMap(({ overtime, assignment, primaryBranch, ...row }) => {
    const history = eventsById.get(overtime.id) ?? [], origin = overtimeSourceSnapshot(history) ?? source(assignment, primaryBranch);
    if (!allowed(origin)) return [];
    const reopened = wasReopened(history);
    return [{ ...overtime, ...row, ...origin, overtimeDate: key(overtime.overtimeDate), totalMinutes: Math.round(Number(overtime.hours) * 60), requestedByName: personName(overtime.requestedBy), reviewedByName: personName(overtime.reviewedBy), approvedByName: personName(overtime.approvedBy), reopened, requiresApprovalReason: reopened,
      canReview: capabilities.canReview && overtime.status === "pending" && overtime.reviewStatus === "pending",
      canDecide: capabilities.canApprove && overtime.status === "pending" && overtime.reviewStatus === "approved",
      canReopen: capabilities.canReopen && overtime.status === "rejected" && overtime.reviewStatus === "approved" && overtime.approvedBy != null,
      history: history.map((event) => { const payload = auditObject(event.newValues); return { id: event.id, stage: String(payload.stage ?? (event.action === "create" ? "request_created" : "legacy")), action: event.action, approved: typeof payload.approved === "boolean" ? payload.approved : null, actorId: event.performedBy, actorName: typeof payload.actorName === "string" ? payload.actorName : personName(event.performedBy), reason: event.reason, createdAt: event.createdAt, oldValues: auditObject(event.oldValues), newValues: payload }; }),
    }];
  });
  const byWorkerDay = new Map<string, typeof assignments>();
  for (const entry of assignments) { const id = `${entry.assignment.workerId}:${key(entry.assignment.workDate)}`, bucket = byWorkerDay.get(id) ?? []; bucket.push(entry); byWorkerDay.set(id, bucket); }
  const recorded = new Set(records.map((row) => `${row.overtime.attendanceId}:${row.overtime.assignmentId}`));
  const candidates = punches.flatMap(({ punch, name, employeeId }) => {
    if (!punch.checkInTime || !punch.checkOutTime) return [];
    const workDate = key(punch.attendanceDate);
    const matching = (byWorkerDay.get(`${punch.workerId}:${workDate}`) ?? []).filter(({ assignment: a }) => punch.checkInTime!.getTime() >= shiftInstant(workDate, a.startTime) - 30 * 60_000 && punch.checkInTime!.getTime() < shiftEndInstant(workDate, a.endTime)).sort((a, b) => shiftInstant(workDate, b.assignment.startTime) - shiftInstant(workDate, a.assignment.startTime));
    const entry = matching[0];
    if (!entry) return [];
    const assignment = entry.assignment, origin = source(assignment, entry.primaryBranch);
    if (!allowed(origin)) return [];
    const minutes = overrunMinutes(punch.checkOutTime, workDate, assignment.endTime);
    if (minutes <= 0 || recorded.has(`${punch.id}:${assignment.id}`)) return [];
    return [{ attendanceId: punch.id, assignmentId: assignment.id, workerId: punch.workerId, name, employeeId, workDate, plannedEnd: assignment.endTime.slice(0, 5), actualEnd: riyadhParts(punch.checkOutTime).minutes, minutes, totalMinutes: minutes, ...origin, canCreate: capabilities.canCreate, canReview: capabilities.canReview }];
  });
  return { items, candidates, centers: centers.filter((center) => isCostCenterAllowed(actor, center.id)).map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn })), ...capabilities };
}

export async function createOvertime(actor: Actor, input: { assignmentId: number; overtimeKind: "planned" | "actual"; endTime?: string; attendanceId?: number; reason: string; initialDecision?: boolean }) {
  requirePermission(actor, "overtime:create");
  const reasonText = overtimeReason(input.reason, true)!;
  const db = await database();
  const [snapshot] = await db.select().from(shiftAssignments).where(eq(shiftAssignments.id, input.assignmentId));
  if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "فترة العمل غير موجودة" });
  return db.transaction(async (tx) => {
    await tx.select({ id: workers.id }).from(workers).where(eq(workers.id, snapshot.workerId)).for("update");
    const [assignment] = await tx.select().from(shiftAssignments).where(eq(shiftAssignments.id, input.assignmentId)).for("update");
    if (!assignment || !active.includes(assignment.status as typeof active[number])) throw new TRPCError({ code: "CONFLICT", message: "فترة العمل غير متاحة لطلب زيادة" });
    const sourceSnapshot = await sourceForAssignment(tx, assignment);
    await assertSourceScope(actor, assignment.workerId, key(assignment.workDate), sourceSnapshot);
    const performedByName = await actorName(tx, actor);
    const [period] = await tx.select().from(schedulePeriods).where(eq(schedulePeriods.id, assignment.periodId));
    if (input.overtimeKind === "planned" && !["draft", "published"].includes(period?.status ?? "")) throw new TRPCError({ code: "CONFLICT", message: "الجدول مقفل أو غير متاح للتعديل" });
    let minutes = 0, endTime = input.endTime;
    if (input.overtimeKind === "planned") {
      if (!endTime) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد نهاية الدوام بعد الزيادة" });
      try { minutes = overtimeExtensionMinutes(assignment.endTime, endTime); assertOperationalInterval({ startTime: assignment.startTime.slice(0, 5), endTime, breakMinutes: assignment.breakMinutes }); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message }); }
    } else {
      if (!input.attendanceId) throw new TRPCError({ code: "BAD_REQUEST", message: "اربط الزيادة بسجل البصمة الفعلي" });
      const [punch] = await tx.select().from(attendance).where(eq(attendance.id, input.attendanceId));
      if (!punch?.checkInTime || !punch.checkOutTime || punch.workerId !== assignment.workerId || key(punch.attendanceDate) !== key(assignment.workDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "سجل البصمة غير مكتمل أو لا يخص يوم العامل" });
      const start = shiftInstant(key(assignment.workDate), assignment.startTime), end = shiftEndInstant(key(assignment.workDate), assignment.endTime);
      if (punch.checkInTime.getTime() < start - 30 * 60_000 || punch.checkInTime.getTime() >= end) throw new TRPCError({ code: "CONFLICT", message: "سجل البصمة لا يطابق فترة المشرف المحددة" });
      minutes = overrunMinutes(punch.checkOutTime, key(assignment.workDate), assignment.endTime);
      if (minutes <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد زيادة فعلية بعد نهاية هذه الفترة" });
      const local = riyadhParts(punch.checkOutTime).minutes;
      endTime = `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
    }
    const duplicate = await tx.select({ id: overtimes.id }).from(overtimes).where(and(eq(overtimes.assignmentId, assignment.id), or(eq(overtimes.status, "pending"), input.overtimeKind === "actual" && input.attendanceId ? eq(overtimes.attendanceId, input.attendanceId) : undefined)));
    if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "يوجد طلب مسجل لهذه الفترة أو الزيادة الفعلية" });
    const canReview = hasPermission(actor as User, "overtime:review");
    if (input.initialDecision !== undefined && !canReview) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية المراجعة الأولية" });
    const reviewed = canReview && (input.overtimeKind === "planned" || input.initialDecision !== undefined);
    const accepted = input.initialDecision !== false;
    let [reason] = await tx.select().from(overtimeReasons).where(eq(overtimeReasons.code, "WORK_HOURS_REQUEST"));
    if (!reason) { await tx.insert(overtimeReasons).values({ code: "WORK_HOURS_REQUEST", reasonAr: "طلب زيادة ساعات عمل" }).onDuplicateKeyUpdate({ set: { reasonAr: "طلب زيادة ساعات عمل" } }); [reason] = await tx.select().from(overtimeReasons).where(eq(overtimeReasons.code, "WORK_HOURS_REQUEST")); }
    const values = { workerId: assignment.workerId, overtimeKind: input.overtimeKind, assignmentId: assignment.id, attendanceId: input.overtimeKind === "actual" ? input.attendanceId : null, requestedBy: actor.id, overtimeDate: assignment.workDate, requestedStartTime: assignment.endTime, requestedEndTime: endTime, originalEndTime: assignment.endTime, reasonText, hours: (minutes / 60).toFixed(2), reasonId: reason.id, hourlyRate: "0", totalAmount: "0", reviewStatus: reviewed ? accepted ? "approved" as const : "rejected" as const : "pending" as const, reviewedBy: reviewed ? actor.id : null, reviewedAt: reviewed ? new Date() : null, reviewNote: reviewed ? reasonText : null, status: reviewed && !accepted ? "rejected" as const : "pending" as const };
    const [{ id }] = await tx.insert(overtimes).values(values).$returningId();
    await tx.insert(auditLogs).values({ entityType: "overtime", entityId: id, action: "create", performedBy: actor.id, newValues: JSON.stringify({ ...values, stage: "request_created", actorName: performedByName, sourceSnapshot, approved: reviewed ? accepted : null }), reason: reasonText });
    if (!reviewed) await tx.insert(notifications).values({ userId: assignment.supervisorId, title: "زيادة ساعات تحتاج مراجعة أولية", message: `الطلب #${id} للعامل #${assignment.workerId}.`, actionUrl: "/overtime", type: "info" });
    return { id, status: values.status, reviewStatus: values.reviewStatus };
  });
}

export async function reviewOvertime(actor: Actor, input: { id: number; approved: boolean; note: string }) {
  requirePermission(actor, "overtime:review");
  const reason = overtimeReason(input.note, true)!;
  const db = await database();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(overtimes).where(eq(overtimes.id, input.id)).for("update");
    if (!row?.assignmentId) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
    const [assignment] = await tx.select().from(shiftAssignments).where(eq(shiftAssignments.id, row.assignmentId));
    if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "فترة العمل غير موجودة" });
    if (row.status !== "pending" || row.reviewStatus !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذا الطلب بالفعل" });
    const events = await overtimeEvents(tx, row.id), sourceSnapshot = overtimeSourceSnapshot(events) ?? await sourceForAssignment(tx, assignment);
    await assertSourceScope(actor, row.workerId, key(row.overtimeDate), sourceSnapshot);
    const performedByName = await actorName(tx, actor), reviewedAt = new Date();
    const updates = { reviewStatus: input.approved ? "approved" as const : "rejected" as const, reviewNote: reason, reviewedBy: actor.id, reviewedAt, status: input.approved ? "pending" as const : "rejected" as const };
    await tx.update(overtimes).set(updates).where(eq(overtimes.id, row.id));
    await tx.insert(auditLogs).values({ entityType: "overtime", entityId: row.id, action: input.approved ? "approve" : "reject", performedBy: actor.id, oldValues: JSON.stringify(row), newValues: JSON.stringify({ ...updates, stage: "supervisor", approved: input.approved, actorName: performedByName, sourceSnapshot }), reason });
    return { success: true };
  });
}

export async function decideOvertime(actor: Actor, input: { id: number; approved: boolean; note?: string }) {
  requirePermission(actor, "overtime:approve");
  const db = await database();
  const [snapshot] = await db.select().from(overtimes).where(eq(overtimes.id, input.id));
  if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: workers.id }).from(workers).where(eq(workers.id, snapshot.workerId)).for("update");
    const [row] = await tx.select().from(overtimes).where(eq(overtimes.id, input.id)).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
    assertFinalDecision(row);
    const events = await overtimeEvents(tx, row.id);
    const reason = finalDecisionReason(input.approved, input.note, wasReopened(events));
    const [sourceAssignment] = row.assignmentId ? await tx.select().from(shiftAssignments).where(eq(shiftAssignments.id, row.assignmentId)).for("update") : [];
    const sourceSnapshot = overtimeSourceSnapshot(events) ?? (sourceAssignment ? await sourceForAssignment(tx, sourceAssignment) : null);
    if (!sourceSnapshot) throw new TRPCError({ code: "CONFLICT", message: "تعذر تحديد فترة الزيادة ومركز تكلفتها" });
    await assertSourceScope(actor, row.workerId, key(row.overtimeDate), sourceSnapshot);
    const performedByName = await actorName(tx, actor);
    let periodId: number | undefined;
    if (input.approved && row.overtimeKind === "actual") {
      const assignment = sourceAssignment;
      if (!assignment || !active.includes(assignment.status as typeof active[number]) || assignment.endTime.slice(0, 5) !== row.originalEndTime?.slice(0, 5))
        throw new TRPCError({ code: "CONFLICT", message: "تغيرت الفترة الأصلية للزيادة الفعلية؛ راجع الطلب قبل اعتماده" });
      const [punch] = row.attendanceId ? await tx.select().from(attendance).where(eq(attendance.id, row.attendanceId)).for("update") : [];
      const workDate = key(row.overtimeDate), expectedMinutes = Math.round(Number(row.hours) * 60);
      if (!punch?.checkInTime || !punch.checkOutTime || punch.workerId !== row.workerId || key(punch.attendanceDate) !== workDate || !row.requestedEndTime || expectedMinutes <= 0)
        throw new TRPCError({ code: "CONFLICT", message: "سجل الحضور المرتبط بالزيادة تغير أو لم يعد مكتملًا" });
      const periodStart = shiftInstant(workDate, assignment.startTime), periodEnd = shiftEndInstant(workDate, assignment.endTime), extraEnd = shiftEndInstant(workDate, row.requestedEndTime);
      if (punch.checkInTime.getTime() < periodStart - 30 * 60_000 || punch.checkInTime.getTime() >= periodEnd || punch.checkOutTime.getTime() < extraEnd || Math.floor((extraEnd - periodEnd) / 60_000) !== expectedMinutes)
        throw new TRPCError({ code: "CONFLICT", message: "البصمة الحالية لا تثبت مدة الزيادة المطلوبة" });
      const others = await tx.select().from(shiftAssignments).where(and(eq(shiftAssignments.workerId, row.workerId), calendarOnOrAfter(shiftAssignments.workDate, date(addCalendarDays(workDate, -1))), calendarOnOrBefore(shiftAssignments.workDate, date(addCalendarDays(workDate, 1))), inArray(shiftAssignments.status, [...active]), ne(shiftAssignments.id, assignment.id)));
      if (others.some((other) => periodEnd < shiftEndInstant(key(other.workDate), other.endTime) && shiftInstant(key(other.workDate), other.startTime) < extraEnd))
        throw new TRPCError({ code: "CONFLICT", message: "الزيادة تتداخل مع فترة رسمية أخرى؛ لا يمكن احتساب نفس الوقت مرتين" });
    }
    if (input.approved && row.overtimeKind === "planned") {
      const assignment = sourceAssignment;
      if (!assignment || !["planned", "confirmed"].includes(assignment.status) || assignment.endTime.slice(0, 5) !== row.originalEndTime?.slice(0, 5)) throw new TRPCError({ code: "CONFLICT", message: "تغيرت فترة العمل بعد تقديم الزيادة؛ قدم طلبًا محدثًا" });
      if (assignment.costCenterId != null && assignment.costCenterId !== sourceSnapshot.costCenterId) throw new TRPCError({ code: "CONFLICT", message: "تغير مركز تكلفة الفترة؛ قدم طلبًا محدثًا" });
      const [period] = await tx.select().from(schedulePeriods).where(eq(schedulePeriods.id, assignment.periodId));
      if (!["draft", "published"].includes(period?.status ?? "")) throw new TRPCError({ code: "CONFLICT", message: "فترة الجدول مقفلة أو غير متاحة" });
      const workDate = key(assignment.workDate), endTime = row.requestedEndTime!.slice(0, 5);
      assertOperationalInterval({ startTime: assignment.startTime.slice(0, 5), endTime, breakMinutes: assignment.breakMinutes });
      await validateApprovedPermissionOverlap(assignment.workerId, workDate, [{ startTime: assignment.startTime, endTime }], tx);
      const calendar = await tx.select({ code: dayTypes.code }).from(workerCalendar).innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId)).where(and(eq(workerCalendar.workerId, assignment.workerId), calendarEquals(workerCalendar.date, assignment.workDate)));
      if (calendar.some((c) => /LEAVE|REST|HOLIDAY/.test(c.code.toUpperCase()))) throw new TRPCError({ code: "CONFLICT", message: "العامل في إجازة أو راحة؛ لا يمكن تمديد الفترة" });
      const existing = await tx.select().from(shiftAssignments).where(and(eq(shiftAssignments.workerId, assignment.workerId), calendarOnOrAfter(shiftAssignments.workDate, date(addCalendarDays(workDate, -1))), calendarOnOrBefore(shiftAssignments.workDate, date(addCalendarDays(workDate, 1))), inArray(shiftAssignments.status, [...active]), ne(shiftAssignments.id, assignment.id)));
      if (findConflict({ workDate, startTime: assignment.startTime, endTime, crossesMidnight: endTime < assignment.startTime.slice(0, 5) }, existing.map((a) => ({ ...a, workDate: key(a.workDate) })))) throw new TRPCError({ code: "CONFLICT", message: "التمديد يتعارض مع فترة عمل أخرى للعامل" });
      await tx.update(shiftAssignments).set({ endTime, crossesMidnight: endTime < assignment.startTime.slice(0, 5), plannedMinutes: assignment.plannedMinutes + Math.round(Number(row.hours) * 60), updatedBy: actor.id }).where(eq(shiftAssignments.id, assignment.id));
      if (period.status === "published") {
        await tx.update(schedulePeriods).set({ status: "draft", publishedBy: null, publishedAt: null }).where(eq(schedulePeriods.id, period.id));
        await tx.insert(auditLogs).values({ entityType: "schedule_period", entityId: period.id, action: "update", performedBy: actor.id, oldValues: JSON.stringify({ status: period.status, publishedAt: period.publishedAt, publishedBy: period.publishedBy }), newValues: JSON.stringify({ status: "draft", overtimeId: row.id }), reason: "تغيير نهاية فترة بعد اعتماد الزيادة؛ يلزم إعادة اعتماد الجدول" });
      }
      await tx.insert(auditLogs).values({ entityType: "shift_assignment", entityId: assignment.id, action: "update", performedBy: actor.id, oldValues: JSON.stringify({ endTime: assignment.endTime, plannedMinutes: assignment.plannedMinutes }), newValues: JSON.stringify({ endTime, overtimeId: row.id }), reason: reason ?? row.reviewNote ?? row.reasonText });
      periodId = assignment.periodId;
    }
    const updates = { status: input.approved ? "approved" as const : "rejected" as const, approvedBy: actor.id, approvedAt: new Date(), decisionNote: reason };
    await tx.update(overtimes).set(updates).where(eq(overtimes.id, row.id));
    await tx.insert(auditLogs).values({ entityType: "overtime", entityId: row.id, action: input.approved ? "approve" : "reject", performedBy: actor.id, oldValues: JSON.stringify(row), newValues: JSON.stringify({ ...updates, stage: "hr_final", approved: input.approved, actorName: performedByName, sourceSnapshot }), reason });
    const recipients = new Set([row.requestedBy, sourceSnapshot.supervisorId].filter((id): id is number => id != null));
    for (const userId of Array.from(recipients)) await tx.insert(notifications).values({ userId, title: input.approved ? "اعتماد نهائي لزيادة الساعات" : "رفض نهائي لزيادة الساعات", message: `الطلب #${row.id}${reason ? `: ${reason}` : ": تم اعتماد الزيادة"}`, actionUrl: "/overtime", type: input.approved ? "success" : "warning" });
    return { success: true, workerId: row.workerId, periodId };
  });
  if (result.periodId) await recalcTimeBalance(result.workerId, result.periodId);
  return { success: true };
}

export async function reopenOvertime(actor: Actor, input: { id: number; reason: string }) {
  // Reopening is a role restriction, not an assignable HR approval permission.
  if (actor.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "إعادة فتح الرفض النهائي متاحة للأدمن فقط" });
  const reason = overtimeReason(input.reason, true)!;
  const db = await database();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(overtimes).where(eq(overtimes.id, input.id)).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
    assertReopen(actor, row);
    const events = await overtimeEvents(tx, row.id);
    const [assignment] = row.assignmentId ? await tx.select().from(shiftAssignments).where(eq(shiftAssignments.id, row.assignmentId)) : [];
    const sourceSnapshot = overtimeSourceSnapshot(events) ?? (assignment ? await sourceForAssignment(tx, assignment) : null);
    if (!sourceSnapshot) throw new TRPCError({ code: "CONFLICT", message: "تعذر تحديد فترة الزيادة ومركز تكلفتها" });
    const performedByName = await actorName(tx, actor);
    const updates = { status: "pending" as const, approvedBy: null, approvedAt: null, decisionNote: null };
    await tx.update(overtimes).set(updates).where(eq(overtimes.id, row.id));
    await tx.insert(auditLogs).values({ entityType: "overtime", entityId: row.id, action: "update", performedBy: actor.id, oldValues: JSON.stringify(row), newValues: JSON.stringify({ ...updates, stage: "admin_reopen", actorName: performedByName, sourceSnapshot, requiresApprovalReason: true }), reason });
    const recipients = new Set([row.approvedBy, row.requestedBy, sourceSnapshot.supervisorId].filter((id): id is number => id != null));
    for (const userId of Array.from(recipients)) await tx.insert(notifications).values({ userId, title: "إعادة فتح رفض العمل الإضافي", message: `أعاد الأدمن فتح الطلب #${row.id} إلى الشؤون الإدارية: ${reason}`, actionUrl: "/overtime", type: "info" });
    return { success: true, status: "pending" as const, reviewStatus: row.reviewStatus, requiresApprovalReason: true };
  });
}

export async function approvedAttendanceForRange(workerId: number, fromDate: string, toDate: string) {
  const db = await database();
  const [punches, assignments, approved] = await Promise.all([
    db.select().from(attendance).where(and(eq(attendance.workerId, workerId), calendarOnOrAfter(attendance.attendanceDate, date(fromDate)), calendarOnOrBefore(attendance.attendanceDate, date(toDate)))),
    db.select().from(shiftAssignments).where(and(eq(shiftAssignments.workerId, workerId), calendarOnOrAfter(shiftAssignments.workDate, date(fromDate)), calendarOnOrBefore(shiftAssignments.workDate, date(toDate)), inArray(shiftAssignments.status, [...active]))),
    db.select().from(overtimes).where(and(eq(overtimes.workerId, workerId), eq(overtimes.overtimeKind, "actual"), eq(overtimes.status, "approved"), calendarOnOrAfter(overtimes.overtimeDate, date(fromDate)), calendarOnOrBefore(overtimes.overtimeDate, date(toDate)))),
  ]);
  const result = new Map<string, number>();
  for (const punch of punches) {
    if (!punch.checkInTime || !punch.checkOutTime) continue;
    const day = key(punch.attendanceDate), dayAssignments = assignments.filter((a) => key(a.workDate) === day);
    const regular = actualRegularMinutes(punch.checkInTime, punch.checkOutTime, dayAssignments.map((a) => ({ ...a, workDate: day })));
    const extra = approved.filter((a) => a.attendanceId === punch.id).reduce((sum, a) => sum + Math.round(Number(a.hours) * 60), 0);
    const elapsed = Math.max(0, Math.floor((punch.checkOutTime.getTime() - punch.checkInTime.getTime()) / 60_000));
    const recorded = punch.actualHours == null ? elapsed : Math.round(Number(punch.actualHours) * 60);
    result.set(day, (result.get(day) ?? 0) + Math.min(elapsed, recorded, regular + extra));
  }
  result.forEach((minutes, day) => { const rest = Math.min(30, assignments.filter((a) => key(a.workDate) === day).reduce((sum, a) => sum + a.breakMinutes, 0)); result.set(day, Math.max(0, minutes - rest)); });
  return result;
}
