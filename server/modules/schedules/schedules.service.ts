import { createAuditLog } from "../../shared/audit";
import { getDb } from "../../shared/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  shiftAssignments,
  workerScheduleSettings,
  schedulePeriods,
} from "../../../drizzle/schema";
import { assertCostCenterScope } from "../../shared/worker-scope";
import type { AuthorizedUser } from "../../shared/rbac";
import { approvedOvertimeForWorkers } from "../overtime/approved-overtime";
import {
  intervalWorkMinutes,
  isCalendarDate,
  sundayOf,
} from "../../../shared/weekly-schedule";
import * as repo from "./schedules.repository";

/**
 * ============================================================================
 * Schedules Service — منطق العمل (بدون tRPC وبدون SQL)
 * S2: فترات الجداول وقوالب الورديات
 * التوقيت المرجعي: Asia/Riyadh — الأسبوع من الأحد إلى السبت.
 * ============================================================================
 */

export class ScheduleError extends Error {
  constructor(
    public code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN_STATE",
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (قابلة للاختبار بدون قاعدة بيانات)
// ---------------------------------------------------------------------------

export type PeriodStatus =
  "draft" | "published" | "locked" | "cancelled" | "archived";

/** انتقالات حالة الفترة المعتمدة في S1 */
const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["locked", "cancelled"],
  locked: ["published", "archived"], // published هنا = إعادة فتح بسبب
  cancelled: [],
  archived: [],
};

export function canTransitionPeriod(
  from: PeriodStatus,
  to: PeriodStatus,
): boolean {
  return PERIOD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PeriodStatus, to: PeriodStatus): void {
  if (!canTransitionPeriod(from, to)) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `الانتقال من الحالة "${from}" إلى "${to}" غير مسموح`,
    );
  }
}

/** yyyy-mm-dd */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDateString(value: string, field: string): void {
  if (!isCalendarDate(value)) {
    throw new ScheduleError("BAD_REQUEST", `تاريخ غير صالح في ${field}`);
  }
}

export function daysBetweenInclusive(
  startDate: string,
  endDate: string,
): number {
  const start = new Date(startDate + "T00:00:00Z").getTime();
  const end = new Date(endDate + "T00:00:00Z").getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** A roster week runs Sunday through Saturday. */
export function isRiyadhWeek(startDate: string, endDate: string): boolean {
  return (
    isCalendarDate(startDate) &&
    isCalendarDate(endDate) &&
    sundayOf(startDate) === startDate &&
    daysBetweenInclusive(startDate, endDate) === 7
  );
}

/** مدة الوردية بالدقائق مع دعم العبور لمنتصف الليل */
export function calculateShiftDuration(
  startTime: string,
  endTime: string,
): { durationMinutes: number; crossesMidnight: boolean } {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(endTime)
  )
    throw new ScheduleError("BAD_REQUEST", "صيغة وقت غير صالحة (HH:MM)");
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (
    [sh, sm, eh, em].some((n) => isNaN(n)) ||
    sh > 23 ||
    eh > 23 ||
    sm > 59 ||
    em > 59
  ) {
    throw new ScheduleError("BAD_REQUEST", "صيغة وقت غير صالحة (HH:MM)");
  }
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin === endMin) {
    throw new ScheduleError("BAD_REQUEST", "وقت البداية يساوي وقت النهاية");
  }
  const crossesMidnight = endMin < startMin;
  const durationMinutes = crossesMidnight
    ? 24 * 60 - startMin + endMin
    : endMin - startMin;
  return { durationMinutes, crossesMidnight };
}

// ---------------------------------------------------------------------------
// فترات الجداول
// ---------------------------------------------------------------------------

export async function createPeriod(input: {
  name: string;
  startDate: string;
  endDate: string;
  createdBy: number;
}) {
  assertDateString(input.startDate, "startDate");
  assertDateString(input.endDate, "endDate");
  const days = daysBetweenInclusive(input.startDate, input.endDate);
  if (days < 1) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "تاريخ النهاية يجب أن يكون في نفس يوم البداية أو بعده",
    );
  }
  if (!input.name.trim()) {
    throw new ScheduleError("BAD_REQUEST", "اسم الفترة مطلوب");
  }

  const overlapping = await repo.findOverlappingPeriods(
    input.startDate,
    input.endDate,
  );
  if (overlapping.length > 0) {
    throw new ScheduleError(
      "CONFLICT",
      `المدى يتداخل مع فترة قائمة: "${overlapping[0].name}" (#${overlapping[0].id})`,
    );
  }

  const id = await repo.insertPeriod({
    name: input.name.trim(),
    startDate: new Date(input.startDate + "T00:00:00Z"),
    endDate: new Date(input.endDate + "T00:00:00Z"),
    status: "draft",
    createdBy: input.createdBy,
  });

  await createAuditLog(
    "schedule_period",
    id,
    "create",
    input.createdBy,
    undefined,
    {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      isRiyadhWeek: isRiyadhWeek(input.startDate, input.endDate),
    },
  );

  return repo.findPeriodById(id);
}

export async function updateDraftPeriod(input: {
  periodId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  updatedBy: number;
}) {
  const period = await requirePeriod(input.periodId);
  if (period.status !== "draft") {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      "لا يمكن تعديل فترة غير مسودة — الحالة الحالية: " + period.status,
    );
  }

  const asStr = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString().slice(0, 10);
  const startDate = input.startDate ?? asStr(period.startDate);
  const endDate = input.endDate ?? asStr(period.endDate);
  assertDateString(startDate, "startDate");
  assertDateString(endDate, "endDate");
  if (daysBetweenInclusive(startDate, endDate) < 1) {
    throw new ScheduleError("BAD_REQUEST", "مدى التواريخ غير صالح");
  }

  const overlapping = await repo.findOverlappingPeriods(
    startDate,
    endDate,
    period.id,
  );
  if (overlapping.length > 0) {
    throw new ScheduleError(
      "CONFLICT",
      `المدى يتداخل مع فترة قائمة: "${overlapping[0].name}" (#${overlapping[0].id})`,
    );
  }

  const oldValues = {
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
  };
  await repo.updatePeriod(period.id, {
    name: input.name?.trim() || period.name,
    startDate: new Date(startDate + "T00:00:00Z"),
    endDate: new Date(endDate + "T00:00:00Z"),
  });
  await createAuditLog(
    "schedule_period",
    period.id,
    "update",
    input.updatedBy,
    oldValues,
    { name: input.name ?? period.name, startDate, endDate },
  );
  return repo.findPeriodById(period.id);
}

export async function publishPeriod(input: {
  periodId: number;
  publishedBy: number;
  actor?: Pick<AuthorizedUser, "id" | "role" | "permissions" | "accessScope">;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const period = await db.transaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(schedulePeriods)
      .where(eq(schedulePeriods.id, input.periodId))
      .for("update");
    if (!period) throw new ScheduleError("NOT_FOUND", "الأسبوع غير موجود");
    assertTransition(period.status as PeriodStatus, "published");
    const assignments = await tx
      .select()
      .from(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.periodId, period.id),
          inArray(shiftAssignments.status, [
            "planned",
            "confirmed",
            "completed",
          ]),
        ),
      );
    if (!assignments.length)
      throw new ScheduleError(
        "BAD_REQUEST",
        "أضف فترات العمل قبل اعتماد الأسبوع",
      );
    const ids = Array.from(new Set(assignments.map((a) => a.workerId)));
    const settings = await tx
      .select()
      .from(workerScheduleSettings)
      .where(inArray(workerScheduleSettings.workerId, ids));
    const dateKey = (value: Date | string) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value;
    const overtime = await approvedOvertimeForWorkers(
      ids,
      dateKey(period.startDate),
      dateKey(period.endDate),
      tx,
    );
    if (input.actor)
      for (const setting of settings)
        await assertCostCenterScope(input.actor, setting.branch);
    const groups = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = `${assignment.workerId}:${String(assignment.workDate instanceof Date ? assignment.workDate.toISOString().slice(0, 10) : assignment.workDate)}`;
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    }
    for (const [key, day] of Array.from(groups.entries())) {
      const config = settings.find((s) => s.workerId === day[0].workerId);
      if (!config)
        throw new ScheduleError(
          "BAD_REQUEST",
          "أكمل إعدادات جميع العمال قبل الاعتماد",
        );
      const work = day.reduce((sum, a) => sum + a.plannedMinutes, 0),
        rest = day.reduce((sum, a) => sum + a.breakMinutes, 0);
      if (
        work >
        Math.round(Number(config.maxDailyHours) * 60) +
          (overtime.get(day[0].workerId)?.get(dateKey(day[0].workDate)) ?? 0)
      )
        throw new ScheduleError("CONFLICT", `تجاوز السقف اليومي للعامل ${key}`);
      if (
        rest > 30 ||
        (work >= Number(config.requiredHoursPerDay) * 60 && rest !== 30)
      )
        throw new ScheduleError(
          "CONFLICT",
          `حدد نصف ساعة راحة منفصلة عن ساعات العمل للعامل ${key}`,
        );
    }
    await tx
      .update(schedulePeriods)
      .set({
        status: "published",
        publishedBy: input.publishedBy,
        publishedAt: new Date(),
      })
      .where(eq(schedulePeriods.id, period.id));
    return period;
  });
  await createAuditLog(
    "schedule_period",
    period.id,
    "approve",
    input.publishedBy,
    { status: period.status },
    { status: "published" },
  );
  return repo.findPeriodById(period.id);
}

export async function cancelPeriod(input: {
  periodId: number;
  reason: string;
  cancelledBy: number;
}) {
  if (!input.reason.trim()) {
    throw new ScheduleError("BAD_REQUEST", "سبب الإلغاء مطلوب");
  }
  const period = await requirePeriod(input.periodId);
  assertTransition(period.status as PeriodStatus, "cancelled");
  await repo.updatePeriod(period.id, {
    status: "cancelled",
    cancelledBy: input.cancelledBy,
    cancelledAt: new Date(),
    cancelReason: input.reason.trim(),
  });
  await createAuditLog(
    "schedule_period",
    period.id,
    "reject",
    input.cancelledBy,
    { status: period.status },
    { status: "cancelled" },
    input.reason,
  );
  return repo.findPeriodById(period.id);
}

export async function lockPeriod(input: {
  periodId: number;
  lockedBy: number;
}) {
  const period = await requirePeriod(input.periodId);
  assertTransition(period.status as PeriodStatus, "locked");
  await repo.updatePeriod(period.id, {
    status: "locked",
    lockedBy: input.lockedBy,
    lockedAt: new Date(),
  });
  await createAuditLog(
    "schedule_period",
    period.id,
    "update",
    input.lockedBy,
    { status: period.status },
    { status: "locked" },
  );
  return repo.findPeriodById(period.id);
}

export async function reopenPeriod(input: {
  periodId: number;
  reason: string;
  reopenedBy: number;
}) {
  if (!input.reason.trim()) {
    throw new ScheduleError("BAD_REQUEST", "سبب إعادة الفتح مطلوب");
  }
  const period = await requirePeriod(input.periodId);
  if (period.status !== "locked") {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      "لا يمكن إعادة فتح فترة غير مقفلة",
    );
  }
  await repo.updatePeriod(period.id, {
    status: "published",
    reopenedBy: input.reopenedBy,
    reopenedAt: new Date(),
    reopenReason: input.reason.trim(),
  });
  await createAuditLog(
    "schedule_period",
    period.id,
    "update",
    input.reopenedBy,
    { status: "locked" },
    { status: "published" },
    input.reason,
  );
  return repo.findPeriodById(period.id);
}

async function requirePeriod(periodId: number) {
  const period = await repo.findPeriodById(periodId);
  if (!period) {
    throw new ScheduleError("NOT_FOUND", `الفترة #${periodId} غير موجودة`);
  }
  return period;
}

export const listPeriods = repo.listPeriods;
export const getPeriod = requirePeriod;

// ---------------------------------------------------------------------------
// قوالب الورديات
// ---------------------------------------------------------------------------

export async function createShiftTemplate(input: {
  code: string;
  nameAr: string;
  nameEn: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  departmentId?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  createdBy: number;
}) {
  const code = input.code.trim().toUpperCase();
  if (!code || !input.nameAr.trim() || !input.nameEn.trim()) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "الرمز والاسمان العربي والإنجليزي مطلوبة",
    );
  }
  const existing = await repo.findShiftTemplateByCode(code);
  if (existing) {
    throw new ScheduleError("CONFLICT", `الرمز "${code}" مستخدم لوردية أخرى`);
  }
  const { durationMinutes, crossesMidnight } = calculateShiftDuration(
    input.startTime,
    input.endTime,
  );
  try {
    intervalWorkMinutes({
      startTime: input.startTime.slice(0, 5),
      endTime: input.endTime.slice(0, 5),
      breakMinutes: input.breakMinutes,
    });
  } catch (e) {
    throw new ScheduleError("BAD_REQUEST", (e as Error).message);
  }
  if (input.effectiveFrom)
    assertDateString(input.effectiveFrom, "effectiveFrom");
  if (input.effectiveTo) assertDateString(input.effectiveTo, "effectiveTo");

  const id = await repo.insertShiftTemplate({
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    crossesMidnight,
    durationMinutes,
    breakMinutes: input.breakMinutes ?? 0,
    departmentId: input.departmentId,
    effectiveFrom: input.effectiveFrom
      ? new Date(input.effectiveFrom + "T00:00:00Z")
      : undefined,
    effectiveTo: input.effectiveTo
      ? new Date(input.effectiveTo + "T00:00:00Z")
      : undefined,
    createdBy: input.createdBy,
  });
  await createAuditLog(
    "shift_template",
    id,
    "create",
    input.createdBy,
    undefined,
    {
      code,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes,
      crossesMidnight,
    },
  );
  return repo.findShiftTemplateById(id);
}

export async function updateShiftTemplate(input: {
  templateId: number;
  nameAr?: string;
  nameEn?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  departmentId?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  updatedBy: number;
}) {
  const tpl = await requireShiftTemplate(input.templateId);

  const startTime = input.startTime ?? tpl.startTime;
  const endTime = input.endTime ?? tpl.endTime;
  const { durationMinutes, crossesMidnight } = calculateShiftDuration(
    startTime,
    endTime,
  );
  try {
    intervalWorkMinutes({
      startTime: startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      breakMinutes: input.breakMinutes ?? tpl.breakMinutes,
    });
  } catch (e) {
    throw new ScheduleError("BAD_REQUEST", (e as Error).message);
  }

  const oldValues = {
    nameAr: tpl.nameAr,
    nameEn: tpl.nameEn,
    startTime: tpl.startTime,
    endTime: tpl.endTime,
  };
  await repo.updateShiftTemplate(tpl.id, {
    nameAr: input.nameAr?.trim() || tpl.nameAr,
    nameEn: input.nameEn?.trim() || tpl.nameEn,
    startTime,
    endTime,
    durationMinutes,
    breakMinutes: input.breakMinutes ?? tpl.breakMinutes,
    crossesMidnight,
    departmentId:
      input.departmentId === undefined ? tpl.departmentId : input.departmentId,
    effectiveFrom:
      input.effectiveFrom === undefined
        ? tpl.effectiveFrom
        : input.effectiveFrom === null
          ? null
          : new Date(input.effectiveFrom + "T00:00:00Z"),
    effectiveTo:
      input.effectiveTo === undefined
        ? tpl.effectiveTo
        : input.effectiveTo === null
          ? null
          : new Date(input.effectiveTo + "T00:00:00Z"),
    updatedBy: input.updatedBy,
  });
  await createAuditLog(
    "shift_template",
    tpl.id,
    "update",
    input.updatedBy,
    oldValues,
    { startTime, endTime, durationMinutes },
  );
  return repo.findShiftTemplateById(tpl.id);
}

export async function setShiftTemplateActive(input: {
  templateId: number;
  isActive: boolean;
  updatedBy: number;
}) {
  const tpl = await requireShiftTemplate(input.templateId);
  if (tpl.isActive === input.isActive) return tpl;
  await repo.updateShiftTemplate(tpl.id, {
    isActive: input.isActive,
    updatedBy: input.updatedBy,
  });
  await createAuditLog(
    "shift_template",
    tpl.id,
    "update",
    input.updatedBy,
    { isActive: tpl.isActive },
    { isActive: input.isActive },
  );
  return repo.findShiftTemplateById(tpl.id);
}

/** يُستخدم لاحقًا في S3 قبل إنشاء تكليف: يمنع استخدام وردية معطلة */
export async function requireActiveShiftTemplate(templateId: number) {
  const tpl = await requireShiftTemplate(templateId);
  if (!tpl.isActive) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `الوردية "${tpl.code}" معطلة ولا يمكن استخدامها`,
    );
  }
  return tpl;
}

async function requireShiftTemplate(templateId: number) {
  const tpl = await repo.findShiftTemplateById(templateId);
  if (!tpl) {
    throw new ScheduleError("NOT_FOUND", `الوردية #${templateId} غير موجودة`);
  }
  return tpl;
}

export const listShiftTemplates = repo.listShiftTemplates;
