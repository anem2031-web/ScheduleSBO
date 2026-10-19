import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { auditLogs, dayTypes, notifications, requests, schedulePeriods, shiftAssignments, supervisorAssignments, workerCalendar, workers, type User } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { calendarOnOrAfter, calendarOnOrBefore } from "../../shared/calendar-date-sql";
import { assertWorkerInScope, getScopedWorkerIdsInRange } from "../../shared/worker-scope";
import * as rbac from "../../shared/rbac";
import { leaveDates, leaveInputSchema, operationalEndMinute, operationalMinute, requestTransition, requestsOverlap, type LeaveInput } from "./leaves.rules";
import { recalcTimeBalance } from "../schedules/assignments.service";

type Actor = Pick<User, "id" | "role"> & { permissions?: string[]; accessScope?: { costCenterIds: number[] } | null };
const date = (value: string) => new Date(`${value}T00:00:00Z`);
export const leaveDateKey = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
function permitted(actor: Actor, permission: string) {
  if (!rbac.hasPermission(actor as User, permission)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية تنفيذ هذا الإجراء على الإجازات والاستئذان" });
}
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر الاتصال بقاعدة البيانات" });
  return db;
}
async function refreshBalances(workerId: number, start: Date, end: Date) {
  const db = await database();
  const periods = await db.select({ id: schedulePeriods.id }).from(schedulePeriods).where(and(calendarOnOrBefore(schedulePeriods.startDate, end), calendarOnOrAfter(schedulePeriods.endDate, start)));
  for (const period of periods) await recalcTimeBalance(workerId, period.id);
}
export function leaveCapabilities(actor: Actor) {
  return {
    canCreate: rbac.hasPermission(actor as User, rbac.LEAVE_CREATE),
    canApprove: rbac.hasPermission(actor as User, rbac.LEAVE_APPROVE),
    canCancel: rbac.hasPermission(actor as User, rbac.LEAVE_CANCEL),
  };
}
export async function listLeaves(actor: Actor, input: { workerId?: number; fromDate: string; toDate: string }) {
  permitted(actor, rbac.LEAVE_READ);
  const ids = await getScopedWorkerIdsInRange(actor, input.fromDate, input.toDate);
  if (input.workerId && ids && !ids.includes(input.workerId)) throw new TRPCError({ code: "FORBIDDEN", message: "العامل خارج نطاق صلاحيات حسابك خلال المدة المطلوبة" });
  const capabilities = leaveCapabilities(actor);
  if (ids && !ids.length) return { items: [], ...capabilities };
  const db = await database();
  const items = await db.select({ request: requests, name: workers.nameAr, employeeId: workers.employeeId })
    .from(requests).innerJoin(workers, eq(workers.id, requests.workerId)).where(and(
      isNotNull(requests.leaveKind), calendarOnOrBefore(requests.startDate, date(input.toDate)), calendarOnOrAfter(requests.endDate, date(input.fromDate)),
      input.workerId ? eq(requests.workerId, input.workerId) : undefined,
      ids ? inArray(requests.workerId, ids) : undefined,
    )).orderBy(desc(requests.createdAt));
  return { items: items.map(({ request, ...worker }) => ({ ...request, ...worker, startDate: leaveDateKey(request.startDate!), endDate: leaveDateKey(request.endDate!) })), ...capabilities };
}

export async function saveLeave(actor: Actor, raw: LeaveInput & { requestId?: number }) {
  permitted(actor, rbac.LEAVE_CREATE);
  const input = leaveInputSchema.parse(raw);
  await assertWorkerInScope(actor, input.workerId, input.startDate);
  const db = await database();
  return db.transaction(async (tx) => {
    const [worker] = await tx.select().from(workers).where(eq(workers.id, input.workerId)).for("update");
    if (!worker?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "العامل غير موجود أو غير نشط" });
    const [existing] = raw.requestId ? await tx.select().from(requests).where(eq(requests.id, raw.requestId)).for("update") : [];
    if (raw.requestId && (!existing || existing.workerId !== input.workerId || !existing.leaveKind)) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود لهذا العامل" });
    if (existing && (!requestTransition(existing.status, "edit") || (existing.submittedBy !== actor.id && !rbac.hasPermission(actor as User, rbac.LEAVE_APPROVE))))
      throw new TRPCError({ code: "CONFLICT", message: "يمكن تعديل الطلب المعلق فقط؛ لتعديل إجازة معتمدة ألغها ثم قدم طلبًا جديدًا" });
    const active = await tx.select().from(requests).where(and(eq(requests.workerId, input.workerId), inArray(requests.status, ["pending", "approved"]), isNotNull(requests.leaveKind), calendarOnOrBefore(requests.startDate, date(input.endDate)), calendarOnOrAfter(requests.endDate, date(input.startDate)), raw.requestId ? ne(requests.id, raw.requestId) : undefined));
    if (active.some((row) => requestsOverlap(input, { ...row, startDate: leaveDateKey(row.startDate!), endDate: leaveDateKey(row.endDate!) })))
      throw new TRPCError({ code: "CONFLICT", message: "يوجد طلب إجازة أو استئذان معتمد أو معلق يتداخل مع هذه المدة" });
    const values = { workerId: input.workerId, requestType: "leave" as const, requestDate: date(input.startDate), leaveKind: input.leaveKind, startDate: date(input.startDate), endDate: date(input.endDate), startTime: input.leaveKind === "permission" ? input.startTime : null, endTime: input.leaveKind === "permission" ? input.endTime : null, reason: input.reason };
    const id = existing ? existing.id : (await tx.insert(requests).values({ ...values, submittedBy: actor.id }).$returningId())[0].id;
    if (existing) await tx.update(requests).set(values).where(eq(requests.id, id));
    await tx.insert(auditLogs).values({ entityType: "leave_request", entityId: id, action: existing ? "update" : "create", performedBy: actor.id, oldValues: existing ? JSON.stringify(existing) : null, newValues: JSON.stringify(values), reason: input.reason });
    return { id, status: "pending" as const };
  });
}

export async function decideLeave(actor: Actor, input: { requestId: number; approved: boolean; decisionNote?: string; permissionMode?: "excused" | "make_up" }) {
  permitted(actor, rbac.LEAVE_APPROVE);
  if (!input.approved && (input.decisionNote?.trim().length ?? 0) < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب سبب الرفض" });
  const db = await database();
  const [snapshot] = await db.select().from(requests).where(eq(requests.id, input.requestId));
  if (!snapshot?.leaveKind) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: workers.id }).from(workers).where(eq(workers.id, snapshot.workerId)).for("update");
    const [request] = await tx.select().from(requests).where(eq(requests.id, input.requestId)).for("update");
    if (!request?.leaveKind || !request.startDate || !request.endDate) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
    await assertWorkerInScope(actor, request.workerId, leaveDateKey(request.startDate));
    if (!requestTransition(request.status, input.approved ? "approve" : "reject")) throw new TRPCError({ code: "CONFLICT", message: "تمت معالجة الطلب بالفعل؛ حدّث القائمة" });
    if (input.approved && request.leaveKind === "permission" && !input.permissionMode) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد عند الاعتماد: إعفاء من الساعات أو تعويضها" });
    let affectedAssignments = 0;
    if (input.approved) {
      const assignments = await tx.select().from(shiftAssignments).where(and(eq(shiftAssignments.workerId, request.workerId), calendarOnOrAfter(shiftAssignments.workDate, request.startDate), calendarOnOrBefore(shiftAssignments.workDate, request.endDate), inArray(shiftAssignments.status, ["planned", "confirmed", "completed"])));
      if (request.leaveKind === "permission") {
        const start = operationalMinute(request.startTime!), end = operationalEndMinute(request.endTime!);
        if (!assignments.some((a) => operationalMinute(a.startTime) <= start && operationalEndMinute(a.endTime) >= end))
          throw new TRPCError({ code: "CONFLICT", message: "وقت الاستئذان يجب أن يقع داخل فترة عمل مجدولة للعامل؛ راجع جدوله أولًا" });
      }
      if (request.leaveKind !== "permission") {
        const existing = await tx.select({ entry: workerCalendar, code: dayTypes.code }).from(workerCalendar).innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId)).where(and(eq(workerCalendar.workerId, request.workerId), calendarOnOrAfter(workerCalendar.date, request.startDate), calendarOnOrBefore(workerCalendar.date, request.endDate)));
        if (existing.some(({ entry, code }) => entry.requestId !== request.id && code.toUpperCase().includes("LEAVE"))) throw new TRPCError({ code: "CONFLICT", message: "توجد إجازة مسجلة في المدة؛ راجعها قبل الاعتماد" });
        const code = request.leaveKind === "sick" ? "SICK_LEAVE" : "ANNUAL_LEAVE";
        let [dayType] = await tx.select().from(dayTypes).where(eq(dayTypes.code, code));
        if (!dayType) {
          await tx.insert(dayTypes).values({ code, nameAr: request.leaveKind === "sick" ? "إجازة مرضية" : "إجازة سنوية", nameEn: request.leaveKind === "sick" ? "Sick leave" : "Annual leave" }).onDuplicateKeyUpdate({ set: { code } });
          [dayType] = await tx.select().from(dayTypes).where(eq(dayTypes.code, code));
        }
        const dates = leaveDates(leaveDateKey(request.startDate), leaveDateKey(request.endDate));
        await tx.insert(workerCalendar).values(dates.map((day) => ({ workerId: request.workerId, date: date(day), dayTypeId: dayType.id, reason: request.reason, approvedBy: actor.id, approvedAt: new Date(), requestId: request.id })));
      }
      affectedAssignments = assignments.length;
      if (request.leaveKind !== "permission") {
        const cancellable = assignments.filter((a) => a.status === "planned" || a.status === "confirmed");
        if (cancellable.length) {
          const periodIds = Array.from(new Set(cancellable.map((a) => a.periodId))).filter((id): id is number => typeof id === "number");
          if (periodIds.length) {
            const periods = await tx.select().from(schedulePeriods).where(inArray(schedulePeriods.id, periodIds));
            if (periods.some((period) => period.status === "locked" || period.status === "archived")) throw new TRPCError({ code: "CONFLICT", message: "الإجازة تؤثر على جدول مقفل؛ أعد فتح الفترة قبل تعديل تكليفاتها" });
            await tx.update(schedulePeriods).set({ status: "draft", publishedBy: null, publishedAt: null }).where(and(inArray(schedulePeriods.id, periodIds), eq(schedulePeriods.status, "published")));
            for (const period of periods.filter((p) => p.status === "published")) await tx.insert(auditLogs).values({ entityType: "schedule_period", entityId: period.id, action: "update", performedBy: actor.id, oldValues: JSON.stringify({ status: "published", publishedBy: period.publishedBy, publishedAt: period.publishedAt }), newValues: JSON.stringify({ status: "draft", leaveRequestId: request.id }), reason: "تعديل فترات العامل بعد اعتماد إجازته؛ يلزم إعادة اعتماد الجدول" });
          }
          await tx.update(shiftAssignments).set({ status: "cancelled", cancelReason: `إجازة معتمدة: الطلب #${request.id}`, updatedBy: actor.id }).where(inArray(shiftAssignments.id, cancellable.map((a) => a.id)));
          await tx.insert(auditLogs).values(cancellable.map((a) => ({ entityType: "shift_assignment", entityId: a.id, action: "update" as const, performedBy: actor.id, oldValues: JSON.stringify({ status: a.status, workDate: a.workDate, startTime: a.startTime, endTime: a.endTime }), newValues: JSON.stringify({ status: "cancelled", leaveRequestId: request.id }), reason: `اعتماد إجازة العامل: ${request.reason}` })));
        }
      }
      const links = await tx.select({ supervisorId: supervisorAssignments.supervisorId }).from(supervisorAssignments).where(and(eq(supervisorAssignments.workerId, request.workerId), calendarOnOrBefore(supervisorAssignments.effectiveFrom, request.endDate), or(calendarOnOrAfter(supervisorAssignments.effectiveTo, request.startDate), isNull(supervisorAssignments.effectiveTo))));
      const recipients = Array.from(new Set([request.submittedBy, ...links.map((row) => row.supervisorId), ...assignments.map((row) => row.supervisorId)])).filter((id): id is number => !!id);
      if (recipients.length) await tx.insert(notifications).values(recipients.map((id) => ({ userId: id, title: request.leaveKind === "permission" ? "اعتماد استئذان عامل" : "اعتماد إجازة عامل", message: `تم اعتماد الطلب #${request.id} من ${leaveDateKey(request.startDate!)} إلى ${leaveDateKey(request.endDate!)}.${affectedAssignments ? request.leaveKind === "permission" ? " راجع تغطية فترة الاستئذان في جدول العامل." : " أُلغيت فترات العمل المخططة خلال الإجازة مع حفظ تاريخها؛ راجع التغطية البديلة." : ""}`, type: affectedAssignments ? "warning" as const : "info" as const, actionUrl: `/workers/${request.workerId}` })));
    } else {
      await tx.insert(notifications).values({ userId: request.submittedBy, title: "رفض طلب إجازة أو استئذان", message: `رُفض الطلب #${request.id}: ${input.decisionNote?.trim()}`, actionUrl: `/workers/${request.workerId}`, type: "warning" });
    }
    await tx.update(requests).set({ status: input.approved ? "approved" : "rejected", approvedBy: actor.id, approvedAt: new Date(), decisionNote: input.decisionNote?.trim() || null, permissionMode: request.leaveKind === "permission" && input.approved ? input.permissionMode : null }).where(eq(requests.id, request.id));
    await tx.insert(auditLogs).values({ entityType: "leave_request", entityId: request.id, action: input.approved ? "approve" : "reject", performedBy: actor.id, oldValues: JSON.stringify({ status: request.status }), newValues: JSON.stringify({ status: input.approved ? "approved" : "rejected", permissionMode: input.permissionMode, affectedAssignments }), reason: input.decisionNote });
    return { success: true, affectedAssignments };
  });
  if (input.approved && snapshot.startDate && snapshot.endDate) await refreshBalances(snapshot.workerId, snapshot.startDate, snapshot.endDate);
  return result;
}

export async function cancelLeave(actor: Actor, input: { requestId: number; reason: string }) {
  const db = await database();
  const [snapshot] = await db.select().from(requests).where(eq(requests.id, input.requestId));
  if (!snapshot?.leaveKind) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: workers.id }).from(workers).where(eq(workers.id, snapshot.workerId)).for("update");
    const [request] = await tx.select().from(requests).where(eq(requests.id, input.requestId)).for("update");
    if (!request?.leaveKind || !request.startDate) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
    await assertWorkerInScope(actor, request.workerId, leaveDateKey(request.startDate));
    if (!(request.status === "pending" && request.submittedBy === actor.id && rbac.hasPermission(actor as User, rbac.LEAVE_CREATE))) permitted(actor, rbac.LEAVE_CANCEL);
    if (!requestTransition(request.status, "cancel")) throw new TRPCError({ code: "CONFLICT", message: "يمكن إلغاء الطلب المعلق أو المعتمد فقط" });
    await tx.delete(workerCalendar).where(and(eq(workerCalendar.workerId, request.workerId), eq(workerCalendar.requestId, request.id)));
    await tx.update(requests).set({ status: "cancelled", cancelledBy: actor.id, cancelledAt: new Date(), decisionNote: input.reason.trim() }).where(eq(requests.id, request.id));
    await tx.insert(auditLogs).values({ entityType: "leave_request", entityId: request.id, action: "update", performedBy: actor.id, oldValues: JSON.stringify({ status: request.status }), newValues: JSON.stringify({ status: "cancelled" }), reason: input.reason.trim() });
    const links = await tx.select({ supervisorId: supervisorAssignments.supervisorId }).from(supervisorAssignments).where(eq(supervisorAssignments.workerId, request.workerId));
    const ids = Array.from(new Set([request.submittedBy, ...links.map((row) => row.supervisorId)]));
    if (ids.length) await tx.insert(notifications).values(ids.map((id) => ({ userId: id, title: "إلغاء إجازة أو استئذان", message: `أُلغي الطلب #${request.id}. السبب: ${input.reason.trim()}. راجع جدول العامل بعد الإلغاء.`, actionUrl: `/workers/${request.workerId}`, type: "info" as const })));
    return { success: true };
  });
  if (snapshot.startDate && snapshot.endDate) await refreshBalances(snapshot.workerId, snapshot.startDate, snapshot.endDate);
  return result;
}
