import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import {
  auditLogs,
  branches,
  branchLocations,
  departments,
  dayTypes,
  jobTitles,
  locationDepartments,
  locations,
  notifications,
  schedulePeriods,
  shiftAssignments,
  shiftTemplates,
  supervisorAssignments,
  timeBalances,
  users,
  workerCalendar,
  workers,
  workerScheduleSettings,
} from "../../../drizzle/schema";
import {
  activeSupervisorLink,
  addCalendarDays,
  directIntervalMinutes,
  intervalWorkMinutes,
  assertOperationalInterval,
  isCalendarDate,
  sundayOf,
  type DirectInterval,
} from "../../../shared/weekly-schedule";
import { getDb } from "../../shared/db";
import { findConflict } from "./assignments.conflict";
import * as rbac from "../../shared/rbac";
import {
  approvedAbsenceForRange,
  permissionOverlapMinutes,
  validateApprovedPermissionOverlap,
} from "../leaves/approved-absence";
import { approvedOvertimeForWorkers } from "../overtime/approved-overtime";

export { getWeeklyBoardPage, getWeeklyBoardExport } from "./weekly-board-page.service";
import { getWeeklyBoardComplete } from "./weekly-board-page.service";
import { primaryDestination, resolveStoredDestination, validateWorkDestination, type DestinationCatalog } from "./work-destination";

type Actor = Pick<
  rbac.AuthorizedUser,
  "id" | "role" | "permissions" | "accessScope"
>;
const activeStatuses = ["planned", "confirmed", "completed"] as const;
const blockingCodes = new Set([
  "EMERGENCY_LEAVE",
  "LEAVE",
  "ANNUAL_LEAVE",
  "SICK_LEAVE",
  "UNPAID_LEAVE",
  "REST",
  "REST_DAY",
  "WEEKLY_REST",
  "HOLIDAY",
  "PUBLIC_HOLIDAY",
]);
const ds = (value: string | Date) =>
  typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00Z`);
function fail(
  message: string,
  code:
    | "BAD_REQUEST"
    | "FORBIDDEN"
    | "CONFLICT"
    | "PRECONDITION_FAILED" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}
function assertWeek(weekStart: string) {
  if (!isCalendarDate(weekStart) || sundayOf(weekStart) !== weekStart)
    fail("اختر أسبوعًا يبدأ يوم الأحد");
}
function assertActor(actor: Actor, write = false) {
  if (
    !(write
      ? rbac.hasPermission(actor, rbac.SCHEDULE_UPDATE) ||
        rbac.hasPermission(actor, rbac.SCHEDULE_CREATE)
      : rbac.hasPermission(actor, rbac.SCHEDULE_READ))
  )
    fail("ليس لديك صلاحية استخدام الجدول الأسبوعي", "FORBIDDEN");
}

export async function getWeeklyBoard(actor: Actor, weekStart: string) {
  return getWeeklyBoardComplete(actor, weekStart);
}

export type WeeklyCellChange = {
  workerId: number;
  workDate: string;
  intervals: DirectInterval[];
};

/** Atomic save: validate the complete proposed roster before changing a single slot. */
export async function saveWeeklyCells(
  actor: Actor,
  input: {
    weekStart: string;
    supervisorId?: number;
    changes: WeeklyCellChange[];
  },
) {
  assertActor(actor, true);
  assertWeek(input.weekStart);
  const weekEnd = addCalendarDays(input.weekStart, 6),
    ownerId = actor.role === "supervisor" ? actor.id : input.supervisorId;
  if (!ownerId) fail("اختر المشرف المسؤول عن هذه الفترات");
  if (!input.changes.length || input.changes.length > 350)
    fail("حدد يومًا واحدًا على الأقل، وبحد أقصى 350 يوم عمل في الحفظ");
  const seen = new Set<string>();
  for (const cell of input.changes) {
    if (
      !isCalendarDate(cell.workDate) ||
      cell.workDate < input.weekStart ||
      cell.workDate > weekEnd
    )
      fail("أحد الأيام خارج الأسبوع المختار");
    const key = `${cell.workerId}:${cell.workDate}`;
    if (seen.has(key)) fail("يوم العامل مكرر في طلب الحفظ");
    seen.add(key);
    if (cell.intervals.length > 6) fail("الحد الأقصى ست فترات للعامل في اليوم");
    for (const interval of cell.intervals) {
      try {
        assertOperationalInterval(interval);
      } catch (e) {
        fail((e as Error).message);
      }
    }
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const ids = Array.from(new Set(input.changes.map((c) => c.workerId))).sort(
      (a, b) => a - b,
    );
    // A worker row serializes concurrent changes to shared daily balances.
    const lockedWorkers = await tx
      .select()
      .from(workers)
      .where(inArray(workers.id, ids))
      .orderBy(workers.id)
      .for("update");
    if (
      lockedWorkers.length !== ids.length ||
      lockedWorkers.some((w) => !w.isActive || w.status !== "active")
    )
      fail("أحد العمال غير موجود أو غير نشط");
    const [owner] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, ownerId), eq(users.isActive, true)));
    if (!owner || !["supervisor", "admin", "hr_admin"].includes(owner.role))
      fail("المشرف المختار غير متاح");
    const links = await tx
      .select()
      .from(supervisorAssignments)
      .where(
        and(
          inArray(supervisorAssignments.workerId, ids),
          eq(supervisorAssignments.supervisorId, ownerId),
        ),
      )
      .for("update");
    for (const cell of input.changes) {
      if (
        !links.some(
          (link) =>
            link.workerId === cell.workerId &&
            activeSupervisorLink(
              {
                effectiveFrom: ds(link.effectiveFrom),
                effectiveTo: link.effectiveTo ? ds(link.effectiveTo) : null,
              },
              cell.workDate,
            ),
        )
      )
        fail(
          "يجب ربط العامل بالمشرف في تاريخ العمل قبل إعداد دوامه",
          "FORBIDDEN",
        );
    }
    const settings = await tx
      .select()
      .from(workerScheduleSettings)
      .where(inArray(workerScheduleSettings.workerId, ids));
    const [orgBranches, orgLocations, orgDepartments, orgJobTitles, orgBranchLocations, orgLocationDepartments] = await Promise.all([
      tx.select().from(branches), tx.select().from(locations), tx.select().from(departments),
      tx.select().from(jobTitles), tx.select().from(branchLocations), tx.select().from(locationDepartments),
    ]);
    const catalog: DestinationCatalog = { centers: orgBranches, locations: orgLocations, departments: orgDepartments, jobTitles: orgJobTitles, branchLocations: orgBranchLocations, locationDepartments: orgLocationDepartments };
    const primaries = new Map(lockedWorkers.map((worker) => [worker.id, primaryDestination(worker, settings.find((config) => config.workerId === worker.id)?.branch, catalog)]));
    const overtime = await approvedOvertimeForWorkers(
      ids,
      input.weekStart,
      weekEnd,
      tx,
    );
    const calendar = await tx
      .select({
        entry: workerCalendar,
        code: dayTypes.code,
        label: dayTypes.nameAr,
      })
      .from(workerCalendar)
      .innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId))
      .where(
        and(
          inArray(workerCalendar.workerId, ids),
          gte(workerCalendar.date, date(input.weekStart)),
          lte(workerCalendar.date, date(weekEnd)),
        ),
      );
    const all = await tx
      .select()
      .from(shiftAssignments)
      .where(
        and(
          inArray(shiftAssignments.workerId, ids),
          gte(
            shiftAssignments.workDate,
            date(addCalendarDays(input.weekStart, -1)),
          ),
          lte(shiftAssignments.workDate, date(addCalendarDays(weekEnd, 1))),
        ),
      )
      .for("update");
    const old = all.filter(
      (a) =>
        a.supervisorId === ownerId &&
        seen.has(`${a.workerId}:${ds(a.workDate)}`) &&
        activeStatuses.includes(a.status as any),
    );
    // A linked supervisor may schedule their shared worker into an allowed center,
    // even when the worker's primary employment belongs to another center.
    // Other scoped users must already have a primary or an actual assignment in scope.
    if (actor.role !== "admin" && actor.accessScope != null) {
      if (!actor.accessScope.costCenterIds.length) fail("لا توجد مراكز تكلفة مسموحة لهذا الحساب", "FORBIDDEN");
      if (actor.role !== "supervisor") for (const workerId of ids) {
        if (!rbac.isCostCenterAllowed(actor, primaries.get(workerId)!.costCenterId) && !all.some((assignment) => assignment.workerId === workerId && ds(assignment.workDate) >= input.weekStart && ds(assignment.workDate) <= weekEnd && activeStatuses.includes(assignment.status as any) && rbac.isCostCenterAllowed(actor, resolveStoredDestination(assignment, primaries.get(workerId)!).costCenterId)))
          fail("العامل خارج نطاق مراكز التكلفة المتاحة لحسابك", "FORBIDDEN");
      }
      if (old.some((assignment) => !rbac.isCostCenterAllowed(actor, resolveStoredDestination(assignment, primaries.get(assignment.workerId)!).costCenterId)))
        fail("هذا اليوم يتضمن فترات لك في مركز خارج نطاقك؛ تحتاج الإدارة إلى تعديل هذا اليوم", "FORBIDDEN");
    }
    const destinations = new Map<DirectInterval, ReturnType<typeof validateWorkDestination>>();
    for (const cell of input.changes) for (const interval of cell.intervals)
      destinations.set(interval, validateWorkDestination(actor, interval, primaries.get(cell.workerId)!, catalog, cell.workDate));
    for (const cell of input.changes) {
      const existing = old.some(
        (a) => a.workerId === cell.workerId && ds(a.workDate) === cell.workDate,
      );
      if (existing && !rbac.hasPermission(actor, rbac.SCHEDULE_UPDATE))
        fail("ليس لديك صلاحية تعديل فترات محفوظة", "FORBIDDEN");
      if (
        !existing &&
        cell.intervals.length &&
        !rbac.hasPermission(actor, rbac.SCHEDULE_CREATE)
      )
        fail("ليس لديك صلاحية إضافة فترات جديدة", "FORBIDDEN");
    }
    if (old.some((a) => a.status === "completed"))
      fail("لا يمكن تغيير فترة منفذة من شاشة الجدولة", "PRECONDITION_FAILED");
    const oldIds = new Set(old.map((a) => a.id));
    const proposed: Array<{
      id: number;
      workerId: number;
      workDate: string;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      plannedMinutes: number;
      breakMinutes?: number;
    }> = all
      .filter(
        (a) => !oldIds.has(a.id) && activeStatuses.includes(a.status as any),
      )
      .map((a) => ({
        ...a,
        workDate: ds(a.workDate),
        startTime: a.startTime.slice(0, 5),
        endTime: a.endTime.slice(0, 5),
      }));
    const templates = await tx
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.isActive, true));
    for (const cell of input.changes) {
      const config = settings.find((s) => s.workerId === cell.workerId);
      if (!config)
        fail("أكمل ساعات العامل ويوم راحته في بطاقته قبل إعداد الجدول");
      await validateApprovedPermissionOverlap(
        cell.workerId,
        cell.workDate,
        cell.intervals,
        tx,
      );
      if (
        cell.intervals.length &&
        (config.weeklyRestDay ===
          new Date(`${cell.workDate}T00:00:00Z`).getUTCDay() ||
          calendar.some(
            (c) =>
              c.entry.workerId === cell.workerId &&
              ds(c.entry.date) === cell.workDate &&
              blockingCodes.has(c.code.toUpperCase()),
          ))
      )
        fail(
          "لا يمكن إضافة دوام في يوم الراحة أو الإجازة. عدّل الراحة أو الإجازة أولًا",
          "CONFLICT",
        );
      for (const interval of cell.intervals) {
        const candidate = {
          ...interval,
          workDate: cell.workDate,
          crossesMidnight: interval.endTime < interval.startTime,
        };
        if (
          findConflict(
            candidate,
            proposed.filter((a) => a.workerId === cell.workerId),
          )
        )
          fail(
            `تداخل فترات العامل يوم ${cell.workDate}، بما فيها فترات المشرفين الآخرين`,
            "CONFLICT",
          );
        const plannedMinutes = intervalWorkMinutes(interval);
        proposed.push({
          ...candidate,
          plannedMinutes,
          workerId: cell.workerId,
          id: -proposed.length - 1,
        });
      }
      const total = proposed
        .filter(
          (a) => a.workerId === cell.workerId && a.workDate === cell.workDate,
        )
        .reduce((sum, a) => sum + a.plannedMinutes, 0);
      if (
        total >
        Number(config.maxDailyHours) * 60 +
          (overtime.get(cell.workerId)?.get(cell.workDate) ?? 0)
      )
        fail(
          `إجمالي فترات يوم ${cell.workDate} يتجاوز الحد اليومي الأقصى المسجل للعامل`,
          "CONFLICT",
        );
      const breaks = proposed
        .filter(
          (a) => a.workerId === cell.workerId && a.workDate === cell.workDate,
        )
        .reduce((sum, a) => sum + (a.breakMinutes ?? 0), 0);
      if (breaks > 30) fail("إجمالي الراحة اليومية نصف ساعة فقط", "CONFLICT");
      const allowed = Array.isArray(config.allowedShifts)
        ? config.allowedShifts.map(String)
        : [];
      if (
        allowed.length &&
        cell.intervals.some(
          (interval) =>
            !templates.some(
              (t) =>
                t.startTime.slice(0, 5) === interval.startTime &&
                t.endTime.slice(0, 5) === interval.endTime &&
                (t.breakMinutes ?? 0) === (interval.breakMinutes ?? 0) &&
                (!t.departmentId ||
                  t.departmentId === destinations.get(interval)!.departmentId) &&
                (!t.effectiveFrom || ds(t.effectiveFrom) <= cell.workDate) &&
                (!t.effectiveTo || ds(t.effectiveTo) >= cell.workDate) &&
                (allowed.includes(String(t.id)) || allowed.includes(t.code)),
            ),
        )
      )
        fail(
          "للعامل ورديات مسموحة محددة؛ اختر أوقات إحدى هذه الورديات أو عدّل الإعداد من الإدارة",
          "CONFLICT",
        );
    }
    // Period management is hidden from the day-to-day editor.
    const overlaps = await tx
      .select()
      .from(schedulePeriods)
      .where(
        and(
          lte(schedulePeriods.startDate, date(weekEnd)),
          gte(schedulePeriods.endDate, date(input.weekStart)),
          ne(schedulePeriods.status, "cancelled"),
        ),
      )
      .for("update");
    let period = overlaps.find(
      (p) => ds(p.startDate) <= input.weekStart && ds(p.endDate) >= weekEnd,
    );
    if (overlaps.length && (!period || overlaps.length > 1))
      fail(
        "توجد فترات متداخلة أو تغطي جزءًا من الأسبوع؛ راجع الإدارة قبل الحفظ",
        "CONFLICT",
      );
    if (period && !["draft", "published"].includes(period.status))
      fail("هذا الأسبوع مقفل أو مؤرشف ولا يقبل التعديل", "PRECONDITION_FAILED");
    if (period?.status === "published") {
      await tx
        .update(schedulePeriods)
        .set({ status: "draft", publishedBy: null, publishedAt: null })
        .where(eq(schedulePeriods.id, period.id));
    }
    if (old.some((a) => period && a.periodId !== period.id))
      fail("الفترات الحالية مرتبطة بجدول آخر؛ راجع الإدارة", "CONFLICT");
    if (!period) {
      const [inserted] = await tx
        .insert(schedulePeriods)
        .values({
          name: `أسبوع ${input.weekStart}`,
          startDate: date(input.weekStart),
          endDate: date(weekEnd),
          createdBy: actor.id,
        })
        .$returningId();
      [period] = await tx
        .select()
        .from(schedulePeriods)
        .where(eq(schedulePeriods.id, inserted.id));
    }
    // Keep history and reuse an owned unique slot when its start time stays unchanged.
    if (old.length)
      await tx
        .update(shiftAssignments)
        .set({
          status: "cancelled",
          cancelReason: "تعديل الجدول الأسبوعي",
          updatedBy: actor.id,
        })
        .where(
          inArray(
            shiftAssignments.id,
            old.map((a) => a.id),
          ),
        );
    for (const cell of input.changes)
      for (const interval of cell.intervals) {
        const config = settings.find((s) => s.workerId === cell.workerId)!;
        const allowed = Array.isArray(config.allowedShifts)
          ? config.allowedShifts.map(String)
          : [];
        const destination = destinations.get(interval)!;
        const departmentId = destination.departmentId;
        let template = templates.find(
          (t) =>
            t.startTime.slice(0, 5) === interval.startTime &&
            t.endTime.slice(0, 5) === interval.endTime &&
            (t.breakMinutes ?? 0) === (interval.breakMinutes ?? 0) &&
            (!t.departmentId || t.departmentId === departmentId) &&
            (!t.effectiveFrom || ds(t.effectiveFrom) <= cell.workDate) &&
            (!t.effectiveTo || ds(t.effectiveTo) >= cell.workDate) &&
            (!allowed.length ||
              allowed.includes(String(t.id)) ||
              allowed.includes(t.code)),
        );
        if (!template) {
          const code = `DIRECT_${interval.startTime.replace(":", "")}_${interval.endTime.replace(":", "")}${interval.breakMinutes ? `_B${interval.breakMinutes}` : ""}`;
          await tx
            .insert(shiftTemplates)
            .values({
              code,
              nameAr: `${interval.startTime} — ${interval.endTime}`,
              nameEn: `${interval.startTime} - ${interval.endTime}`,
              startTime: interval.startTime,
              endTime: interval.endTime,
              durationMinutes: directIntervalMinutes(interval),
              breakMinutes: interval.breakMinutes ?? 0,
              crossesMidnight: interval.endTime < interval.startTime,
              createdBy: actor.id,
            })
            .onDuplicateKeyUpdate({ set: { isActive: true } });
          [template] = await tx
            .select()
            .from(shiftTemplates)
            .where(eq(shiftTemplates.code, code));
          templates.push(template);
        }
        const slot = all.find(
          (a) =>
            a.workerId === cell.workerId &&
            ds(a.workDate) === cell.workDate &&
            a.startTime.slice(0, 5) === interval.startTime,
        );
        const values = {
          periodId: period.id,
          workerId: cell.workerId,
          shiftTemplateId: template.id,
          supervisorId: ownerId,
          ...destination,
          workDate: date(cell.workDate),
          startTime: interval.startTime,
          endTime: interval.endTime,
          crossesMidnight: interval.endTime < interval.startTime,
          plannedMinutes: intervalWorkMinutes(interval),
          breakMinutes: interval.breakMinutes ?? 0,
          status: "planned" as const,
          cancelReason: null,
          updatedBy: actor.id,
        };
        if (slot) {
          if (
            slot.supervisorId !== ownerId ||
            slot.status === "completed" ||
            slot.status === "transferred"
          )
            fail(
              "يوجد سجل محفوظ بنفس بداية الفترة؛ اختر وقتًا آخر أو راجع الإدارة",
              "CONFLICT",
            );
          await tx
            .update(shiftAssignments)
            .set(values)
            .where(eq(shiftAssignments.id, slot.id));
        } else
          await tx
            .insert(shiftAssignments)
            .values({ ...values, createdBy: actor.id });
      }
    for (const workerId of ids) {
      const config = settings.find((s) => s.workerId === workerId)!;
      // A legacy multi-week period still retains its full balance range.
      const periodCalendar = await tx
        .select({ entry: workerCalendar, code: dayTypes.code })
        .from(workerCalendar)
        .innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId))
        .where(
          and(
            eq(workerCalendar.workerId, workerId),
            gte(workerCalendar.date, period.startDate),
            lte(workerCalendar.date, period.endDate),
          ),
        );
      let days = 0;
      for (
        let cursor = ds(period.startDate);
        cursor <= ds(period.endDate);
        cursor = addCalendarDays(cursor, 1)
      )
        if (
          new Date(`${cursor}T00:00:00Z`).getUTCDay() !==
            config.weeklyRestDay &&
          !periodCalendar.some(
            (c) =>
              ds(c.entry.date) === cursor &&
              blockingCodes.has(c.code.toUpperCase()),
          )
        )
          days++;
      const current = await tx
        .select()
        .from(shiftAssignments)
        .where(
          and(
            eq(shiftAssignments.periodId, period.id),
            eq(shiftAssignments.workerId, workerId),
            inArray(shiftAssignments.status, [...activeStatuses]),
          ),
        );
      const absence = await approvedAbsenceForRange(
        workerId,
        ds(period.startDate),
        ds(period.endDate),
        tx,
      );
      const scheduledMinutes = current.reduce(
          (sum, a) =>
            sum +
            Math.max(
              0,
              a.plannedMinutes -
                permissionOverlapMinutes(
                  a.startTime,
                  a.endTime,
                  absence.permissions.filter(
                    (p) => p.workDate === ds(a.workDate),
                  ),
                ),
            ),
          0,
        ),
        requiredMinutes = Math.max(
          0,
          Math.round(Number(config.requiredHoursPerDay) * 60) * days -
            Array.from(absence.excusedMinutesByDate.entries())
              .filter(
                ([d]) =>
                  new Date(`${d}T00:00:00Z`).getUTCDay() !==
                    config.weeklyRestDay &&
                  !periodCalendar.some(
                    (c) =>
                      ds(c.entry.date) === d &&
                      blockingCodes.has(c.code.toUpperCase()),
                  ),
              )
              .reduce(
                (sum, [, minutes]) =>
                  sum +
                  Math.min(
                    minutes,
                    Math.round(Number(config.requiredHoursPerDay) * 60),
                  ),
                0,
              ),
        );
      await tx
        .insert(timeBalances)
        .values({
          workerId,
          periodId: period.id,
          scheduledMinutes,
          requiredMinutes,
          executedMinutes: 0,
          remainingMinutes: Math.max(0, requiredMinutes - scheduledMinutes),
        })
        .onDuplicateKeyUpdate({
          set: {
            scheduledMinutes,
            requiredMinutes,
            remainingMinutes: Math.max(0, requiredMinutes - scheduledMinutes),
            lastRecalculatedAt: new Date(),
          },
        });
    }
    const affectedLinks = await tx
      .select()
      .from(supervisorAssignments)
      .where(
        and(
          inArray(supervisorAssignments.workerId, ids),
          ne(supervisorAssignments.supervisorId, actor.id),
          lte(supervisorAssignments.effectiveFrom, date(weekEnd)),
          or(
            isNull(supervisorAssignments.effectiveTo),
            gte(supervisorAssignments.effectiveTo, date(input.weekStart)),
          ),
        ),
      );
    const recipients = Array.from(
      new Set(
        affectedLinks
          .filter((link) =>
            input.changes.some(
              (cell) =>
                cell.workerId === link.workerId &&
                activeSupervisorLink(
                  {
                    effectiveFrom: ds(link.effectiveFrom),
                    effectiveTo: link.effectiveTo ? ds(link.effectiveTo) : null,
                  },
                  cell.workDate,
                ),
            ),
          )
          .map((link) => link.supervisorId),
      ),
    );
    if (recipients.length)
      await tx.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          title: "تعديل جدول عامل مشترك",
          message: `عُدلت فترات عامل مرتبط بك في أسبوع ${input.weekStart}. راجع الجدول والرصيد المتبقي.`,
          actionUrl: "/schedules",
          type: "info" as const,
        })),
      );
    await tx.insert(auditLogs).values({
      entityType: "weekly_schedule",
      entityId: period.id,
      action: "update",
      performedBy: actor.id,
      oldValues: old,
      newValues: { supervisorId: ownerId, changes: input.changes },
      reason: "إعداد الجدول الأسبوعي المباشر",
    });
    return {
      savedCells: input.changes.length,
      periodId: period.id,
      notifiedSupervisors: recipients.length,
    };
  });
}
