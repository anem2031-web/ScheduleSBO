import { createAuditLog } from "../../shared/audit";
import * as repo from "./assignments.repository";
import * as schedRepo from "./schedules.repository";
import {
  ScheduleError,
  requireActiveShiftTemplate,
  calculateShiftDuration,
  assertDateString,
} from "./schedules.service";
import { findConflict, type ExistingAssignment } from "./assignments.conflict";
import {
  assertOperationalInterval,
  intervalWorkMinutes,
} from "../../../shared/weekly-schedule";
import {
  approvedAbsenceForRange,
  permissionOverlapMinutes,
  validateApprovedPermissionOverlap,
} from "../leaves/approved-absence";
import { excludesRequiredHours } from "../workers/work-budget";
import { approvedOvertimeMinutes } from "../overtime/approved-overtime";

/**
 * ============================================================================
 * Assignments Service (S3) — منطق التكليفات والحجوزات
 * ----------------------------------------------------------------------------
 * قواعد الإنشاء المعتمدة (بالترتيب):
 * 1. الفترة موجودة وحالتها draft أو published (لا تكليف في locked/cancelled/archived)
 * 2. تاريخ العمل داخل مدى الفترة
 * 3. العامل موجود ونشط
 * 4. الوردية موجودة ونشطة، ومسموحة للعامل إن كانت قائمته محددة
 * 5. لا إجازة/يوم راحة للعامل في اليوم (إلا باستثناء معتمد لاحقًا)
 * 6. لا تعارض زمنيًا مع تكليفاته الفعالة (يشمل العابرة لمنتصف الليل ليوم أمس)
 * 7. لا يتجاوز الحد اليومي الأقصى للعامل
 * بعد الإنشاء/التعديل/الإلغاء يعاد حساب رصيد الفترة للعامل.
 * ============================================================================
 */

const ASSIGNABLE_PERIOD_STATUSES = ["draft", "published"];

// أكواد أنواع الأيام التي تمنع التكليف (تُفحص بغض النظر عن حالة الحروف)
const BLOCKING_DAY_TYPE_CODES = [
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
];

function dstr(v: Date | string): string {
  return typeof v === "string" ? v : v.toISOString().slice(0, 10);
}

function tstr(v: string): string {
  // توحيد HH:MM:SS -> HH:MM للمحرك
  return v.slice(0, 5);
}

async function requireAssignablePeriod(periodId: number) {
  const period = await schedRepo.findPeriodById(periodId);
  if (!period) {
    throw new ScheduleError("NOT_FOUND", `الفترة #${periodId} غير موجودة`);
  }
  if (!ASSIGNABLE_PERIOD_STATUSES.includes(period.status)) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `لا يمكن التكليف في فترة حالتها "${period.status}"`,
    );
  }
  return period;
}

async function requireActiveWorker(workerId: number) {
  const worker = await repo.findWorkerById(workerId);
  if (!worker) {
    throw new ScheduleError("NOT_FOUND", `العامل #${workerId} غير موجود`);
  }
  if ((worker as any).status && (worker as any).status !== "active") {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `العامل ${worker.employeeId} غير نشط (${(worker as any).status})`,
    );
  }
  return worker;
}

async function runPreAssignmentChecks(input: {
  periodId: number;
  workerId: number;
  shiftTemplateId: number;
  workDate: string;
  excludeAssignmentId?: number;
}) {
  const period = await requireAssignablePeriod(input.periodId);

  assertDateString(input.workDate, "workDate");
  const pStart = dstr(period.startDate);
  const pEnd = dstr(period.endDate);
  if (input.workDate < pStart || input.workDate > pEnd) {
    throw new ScheduleError(
      "BAD_REQUEST",
      `تاريخ العمل ${input.workDate} خارج مدى الفترة (${pStart} - ${pEnd})`,
    );
  }

  const worker = await requireActiveWorker(input.workerId);
  const template = await requireActiveShiftTemplate(input.shiftTemplateId);

  // الورديات المسموحة للعامل (إن حُددت قائمة)
  const settings = await repo.findWorkerScheduleSettings(input.workerId);
  if (settings?.allowedShifts) {
    const allowed = Array.isArray(settings.allowedShifts)
      ? (settings.allowedShifts as unknown[]).map(String)
      : [];
    if (
      allowed.length > 0 &&
      !allowed.includes(String(template.id)) &&
      !allowed.includes(template.code)
    ) {
      throw new ScheduleError(
        "FORBIDDEN_STATE",
        `الوردية "${template.code}" غير مسموحة للعامل ${worker.employeeId}`,
      );
    }
  }

  // يوم الراحة الأسبوعية من البطاقة
  const restDay = (settings as any)?.weeklyRestDay;
  if (restDay !== null && restDay !== undefined) {
    const dow = new Date(input.workDate + "T00:00:00Z").getUTCDay();
    if (dow === restDay) {
      throw new ScheduleError(
        "CONFLICT",
        `يوم ${input.workDate} هو يوم الراحة الأسبوعية للعامل ${worker.employeeId}`,
      );
    }
  }

  // الإجازات وأيام الراحة
  const calendar = await repo.findWorkerCalendarForDate(
    input.workerId,
    input.workDate,
  );
  const blocking = calendar.find((c) =>
    BLOCKING_DAY_TYPE_CODES.includes(c.dayTypeCode.toUpperCase()),
  );
  if (blocking) {
    throw new ScheduleError(
      "CONFLICT",
      `لا يمكن تكليف العامل ${worker.employeeId} يوم ${input.workDate}: ${blocking.dayTypeNameAr}`,
    );
  }

  // نافذة يوم قبل/بعد لالتقاط العابرة لمنتصف الليل
  const from = new Date(input.workDate + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(input.workDate + "T00:00:00Z");
  to.setUTCDate(to.getUTCDate() + 1);
  const existingRaw = await repo.findActiveAssignmentsForWorker(
    input.workerId,
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10),
  );
  const existing: (ExistingAssignment & { plannedMinutes: number })[] =
    existingRaw
      .filter((a) => a.id !== input.excludeAssignmentId)
      .map((a) => ({
        id: a.id,
        workDate: dstr(a.workDate),
        startTime: tstr(a.startTime),
        endTime: tstr(a.endTime),
        crossesMidnight: a.crossesMidnight,
        plannedMinutes: a.plannedMinutes,
      }));

  return { period, worker, template, settings, existing };
}

export async function createAssignment(input: {
  periodId: number;
  workerId: number;
  shiftTemplateId: number;
  supervisorId: number;
  departmentId?: number;
  costCenterId?: number;
  locationId?: number;
  jobTitleId?: number | null;
  workDate: string;
  createdBy: number;
}) {
  const { worker, template, settings, existing } =
    await runPreAssignmentChecks(input);

  const startTime = tstr(template.startTime);
  const endTime = tstr(template.endTime);
  const crossesMidnight = template.crossesMidnight;
  const plannedMinutes = intervalWorkMinutes({
    startTime,
    endTime,
    breakMinutes: template.breakMinutes,
  });
  try {
    assertOperationalInterval({
      startTime,
      endTime,
      breakMinutes: template.breakMinutes,
    });
  } catch (e) {
    throw new ScheduleError("BAD_REQUEST", (e as Error).message);
  }
  await validateApprovedPermissionOverlap(input.workerId, input.workDate, [
    { startTime, endTime },
  ]);

  // محرك التعارض الزمني
  const conflict = findConflict(
    { workDate: input.workDate, startTime, endTime, crossesMidnight },
    existing,
  );
  if (conflict) {
    throw new ScheduleError(
      "CONFLICT",
      `تعارض زمني مع تكليف قائم #${conflict.id} يوم ${conflict.workDate} (${conflict.startTime}-${conflict.endTime})`,
    );
  }

  // الحد اليومي الأقصى
  if (settings?.maxDailyHours) {
    const maxMinutes =
      Math.round(Number(settings.maxDailyHours) * 60) +
      (await approvedOvertimeMinutes(input.workerId, input.workDate));
    const sameDayTotal =
      plannedMinutes +
      existing
        .filter((e) => e.workDate === input.workDate)
        .reduce((sum, e) => sum + e.plannedMinutes, 0);
    if (sameDayTotal > maxMinutes) {
      throw new ScheduleError(
        "CONFLICT",
        `تجاوز الحد اليومي للعامل ${worker.employeeId}: ${sameDayTotal} دقيقة > ${maxMinutes} دقيقة`,
      );
    }
  }

  const id = await repo.insertAssignment({
    periodId: input.periodId,
    workerId: input.workerId,
    shiftTemplateId: input.shiftTemplateId,
    supervisorId: input.supervisorId,
    departmentId: input.departmentId ?? template.departmentId ?? undefined,
    costCenterId: input.costCenterId,
    locationId: input.locationId,
    jobTitleId: input.jobTitleId,
    workDate: new Date(input.workDate + "T00:00:00Z"),
    startTime: template.startTime,
    endTime: template.endTime,
    crossesMidnight,
    plannedMinutes,
    breakMinutes: template.breakMinutes,
    status: "planned",
    createdBy: input.createdBy,
  });

  await createAuditLog(
    "shift_assignment",
    id,
    "create",
    input.createdBy,
    undefined,
    {
      periodId: input.periodId,
      workerId: input.workerId,
      shiftCode: template.code,
      workDate: input.workDate,
      plannedMinutes,
    },
  );

  await recalcTimeBalance(input.workerId, input.periodId);
  await invalidatePublishedPeriod(input.periodId, input.createdBy);
  return repo.findAssignmentById(id);
}

export async function cancelAssignment(input: {
  assignmentId: number;
  reason: string;
  cancelledBy: number;
}) {
  if (!input.reason.trim()) {
    throw new ScheduleError("BAD_REQUEST", "سبب الإلغاء مطلوب");
  }
  const assignment = await requireAssignment(input.assignmentId);
  if (!["planned", "confirmed"].includes(assignment.status)) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `لا يمكن إلغاء تكليف حالته "${assignment.status}"`,
    );
  }
  await repo.updateAssignment(assignment.id, {
    status: "cancelled",
    cancelReason: input.reason.trim(),
    updatedBy: input.cancelledBy,
  });
  await createAuditLog(
    "shift_assignment",
    assignment.id,
    "delete",
    input.cancelledBy,
    { status: assignment.status },
    { status: "cancelled" },
    input.reason,
  );
  await recalcTimeBalance(assignment.workerId, assignment.periodId);
  await invalidatePublishedPeriod(assignment.periodId, input.cancelledBy);
  return repo.findAssignmentById(assignment.id);
}

export async function confirmAssignment(input: {
  assignmentId: number;
  confirmedBy: number;
}) {
  const assignment = await requireAssignment(input.assignmentId);
  if (assignment.status !== "planned") {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `لا يمكن تأكيد تكليف حالته "${assignment.status}"`,
    );
  }
  await repo.updateAssignment(assignment.id, {
    status: "confirmed",
    updatedBy: input.confirmedBy,
  });
  await createAuditLog(
    "shift_assignment",
    assignment.id,
    "approve",
    input.confirmedBy,
    { status: "planned" },
    { status: "confirmed" },
  );
  return repo.findAssignmentById(assignment.id);
}

/**
 * نقل تكليف: إلغاء الأصل (status=transferred) وإنشاء تكليف جديد
 * بوردية/تاريخ/مشرف جديد بعد كل الفحوصات.
 */
export async function transferAssignment(input: {
  assignmentId: number;
  newWorkDate?: string;
  newShiftTemplateId?: number;
  newSupervisorId?: number;
  reason: string;
  transferredBy: number;
}) {
  if (!input.reason.trim()) {
    throw new ScheduleError("BAD_REQUEST", "سبب النقل مطلوب");
  }
  const original = await requireAssignment(input.assignmentId);
  if (!["planned", "confirmed"].includes(original.status)) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `لا يمكن نقل تكليف حالته "${original.status}"`,
    );
  }

  const newAssignment = await createAssignment({
    periodId: original.periodId,
    workerId: original.workerId,
    shiftTemplateId: input.newShiftTemplateId ?? original.shiftTemplateId,
    supervisorId: input.newSupervisorId ?? original.supervisorId,
    departmentId: original.departmentId ?? undefined,
    costCenterId: original.costCenterId ?? undefined,
    locationId: original.locationId ?? undefined,
    jobTitleId: original.jobTitleId,
    workDate: input.newWorkDate ?? dstr(original.workDate),
    createdBy: input.transferredBy,
  });

  await repo.updateAssignment(original.id, {
    status: "transferred",
    transferredToId: newAssignment!.id,
    cancelReason: input.reason.trim(),
    updatedBy: input.transferredBy,
  });
  await createAuditLog(
    "shift_assignment",
    original.id,
    "update",
    input.transferredBy,
    { status: original.status },
    { status: "transferred", transferredToId: newAssignment!.id },
    input.reason,
  );
  await recalcTimeBalance(original.workerId, original.periodId);
  return {
    original: await repo.findAssignmentById(original.id),
    new: newAssignment,
  };
}

/**
 * نسخ تكليفات يوم كامل إلى يوم آخر (داخل نفس الفترة أو فترة أخرى قابلة للتكليف).
 * يتخطى ما يفشل في الفحوصات ويعيد تقريرًا.
 */
export async function copyDayAssignments(input: {
  sourceDate: string;
  targetDate: string;
  targetPeriodId: number;
  copiedBy: number;
}) {
  assertDateString(input.sourceDate, "sourceDate");
  assertDateString(input.targetDate, "targetDate");
  await requireAssignablePeriod(input.targetPeriodId);

  const source = await repo.listAssignments({ workDate: input.sourceDate });
  const results: {
    sourceId: number;
    status: "copied" | "skipped";
    newId?: number;
    reason?: string;
  }[] = [];

  for (const a of source) {
    try {
      const created = await createAssignment({
        periodId: input.targetPeriodId,
        workerId: a.workerId,
        shiftTemplateId: a.shiftTemplateId,
        supervisorId: a.supervisorId,
        departmentId: a.departmentId ?? undefined,
        costCenterId: a.costCenterId ?? undefined,
        locationId: a.locationId ?? undefined,
        jobTitleId: a.jobTitleId,
        workDate: input.targetDate,
        createdBy: input.copiedBy,
      });
      results.push({ sourceId: a.id, status: "copied", newId: created!.id });
    } catch (e) {
      results.push({
        sourceId: a.id,
        status: "skipped",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    total: source.length,
    copied: results.filter((r) => r.status === "copied").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    details: results,
  };
}

/**
 * إعادة حساب رصيد الفترة للعامل من التكليفات الفعالة وإعدادات العامل.
 * القاعدة الذهبية (WORKER_CARD_SPEC §5): المطلوب = الساعات اليومية × أيام
 * العمل الفعلية فقط — يُخصم يوم الراحة الأسبوعية وأيام الإجازة، ولا تُحسب
 * ساعات عمل عليها.
 */
export async function recalcTimeBalance(workerId: number, periodId: number) {
  const period = await schedRepo.findPeriodById(periodId);
  if (!period) return;
  const current = await repo.listAssignments({ workerId, periodId });
  const absence = await approvedAbsenceForRange(
    workerId,
    dstr(period.startDate),
    dstr(period.endDate),
  );
  const scheduledMinutes = current
    .filter((a) => ["planned", "confirmed", "completed"].includes(a.status))
    .reduce(
      (sum, a) =>
        sum +
        Math.max(
          0,
          a.plannedMinutes -
            permissionOverlapMinutes(
              a.startTime,
              a.endTime,
              absence.permissions.filter(
                (p) => p.workDate === dstr(a.workDate),
              ),
            ),
        ),
      0,
    );

  const settings = await repo.findWorkerScheduleSettings(workerId);
  let requiredMinutes = 0;
  if (settings?.requiredHoursPerDay) {
    const dailyMinutes = Math.round(Number(settings.requiredHoursPerDay) * 60);
    const startStr = dstr(period.startDate);
    const endStr = dstr(period.endDate);
    const restDay = (settings as any).weeklyRestDay;

    const calendar = await repo.findWorkerCalendarInRange(
      workerId,
      startStr,
      endStr,
    );
    const leaveDates = new Set(
      calendar
        .filter((e) => excludesRequiredHours(e.dayTypeCode))
        .map((e) => (typeof e.date === "string" ? e.date : dstr(e.date))),
    );

    let workingMinutes = 0;
    const cursor = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    while (cursor <= end) {
      const ds = cursor.toISOString().slice(0, 10);
      const dow = cursor.getUTCDay();
      const isRest =
        restDay !== null && restDay !== undefined && dow === restDay;
      if (!isRest && !leaveDates.has(ds))
        workingMinutes += Math.max(
          0,
          dailyMinutes - (absence.excusedMinutesByDate.get(ds) ?? 0),
        );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    requiredMinutes = workingMinutes;
  }

  const existing = await repo.findTimeBalance(workerId, periodId);
  await repo.upsertTimeBalance({
    workerId,
    periodId,
    requiredMinutes,
    scheduledMinutes,
    executedMinutes: existing?.executedMinutes ?? 0,
  });
}

export async function getTimeBalance(workerId: number, periodId: number) {
  await recalcTimeBalance(workerId, periodId);
  return repo.findTimeBalance(workerId, periodId);
}

async function requireAssignment(assignmentId: number) {
  const assignment = await repo.findAssignmentById(assignmentId);
  if (!assignment) {
    throw new ScheduleError("NOT_FOUND", `التكليف #${assignmentId} غير موجود`);
  }
  return assignment;
}

export const listAssignments = repo.listAssignments;

async function invalidatePublishedPeriod(periodId: number, actorId: number) {
  const period = await schedRepo.findPeriodById(periodId);
  if (period?.status !== "published") return;
  await schedRepo.updatePeriod(periodId, {
    status: "draft",
    publishedBy: null,
    publishedAt: null,
  });
  await createAuditLog(
    "schedule_period",
    periodId,
    "update",
    actorId,
    {
      status: "published",
      publishedBy: period.publishedBy,
      publishedAt: period.publishedAt,
    },
    { status: "draft" },
    "تغيير الفترات يتطلب إعادة اعتماد الأسبوع",
  );
}
