import { createAuditLog } from "../../shared/audit";
import * as repo from "./attendance.repository";
import { operationalClockMinutes, operationalDate } from "../../../shared/operational-day";

/**
 * ============================================================================
 * Attendance Service — منطق العمل (بدون tRPC وبدون SQL)
 * ----------------------------------------------------------------------------
 * هذه الطبقة قابلة للاختبار وإعادة الاستخدام من أي مكان (Cron, CLI, router آخر).
 * لا تعرف شيئًا عن tRPC — الأخطاء ترمى كـ Error عادية بكود، والـ router
 * يحوّلها إلى TRPCError.
 * ============================================================================
 */

export class AttendanceError extends Error {
  constructor(
    public code: "NOT_FOUND" | "BAD_REQUEST",
    message: string
  ) {
    super(message);
    this.name = "AttendanceError";
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (قابلة للاختبار بدون قاعدة بيانات)
// ---------------------------------------------------------------------------

export function getDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const RIYADH_TIME_ZONE = "Asia/Riyadh";
const RIYADH_UTC_OFFSET_MINUTES = 3 * 60;

/**
 * يعيد تاريخ يوم الرياض كـ UTC midnight حتى يطابق حقول DATE في قاعدة البيانات.
 */
export function getRiyadhDateOnly(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return new Date(
    Date.UTC(
      getPart("year"),
      getPart("month") - 1,
      getPart("day"),
      0,
      0,
      0,
      0
    )
  );
}

function dateOnlyToYmd(date: Date): [number, number, number] {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  ];
}

/**
 * يحول تاريخ عمل + وقت وردية محلي في الرياض إلى instant حقيقي UTC.
 * الرياض ثابتة UTC+3 ولا تستخدم DST.
 */
function riyadhShiftInstant(
  workDate: Date,
  time: string,
  dayOffset?: number
): Date {
  const [year, month, day] = dateOnlyToYmd(workDate);
  const [hour, minute, second = 0] = time.split(":").map(Number);

  const utcMs =
    Date.UTC(year, month - 1, day + (dayOffset ?? (operationalClockMinutes(time) >= 1440 ? 1 : 0)), hour, minute, second, 0) -
    RIYADH_UTC_OFFSET_MINUTES * 60_000;

  return new Date(utcMs);
}

function calculateLateMinutesFromAssignment(
  checkInTime: Date,
  assignment: {
    workDate: Date;
    startTime: string;
  }
): number {
  const shiftStart = riyadhShiftInstant(
    assignment.workDate,
    assignment.startTime
  );

  return Math.max(
    0,
    Math.floor((checkInTime.getTime() - shiftStart.getTime()) / 60_000)
  );
}

function calculateOvertimeMinutesFromAssignment(
  checkOutTime: Date,
  assignment: {
    workDate: Date;
    endTime: string;
    crossesMidnight: boolean;
  }
): number {
  const shiftEnd = riyadhShiftInstant(
    assignment.workDate,
    assignment.endTime,
    assignment.crossesMidnight ? 1 : undefined
  );

  return Math.max(
    0,
    Math.floor((checkOutTime.getTime() - shiftEnd.getTime()) / 60_000)
  );
}

export function calculateLateMinutes(
  checkInTime: Date,
  shiftStartTime: string
): number {
  const shiftStart = new Date(checkInTime);
  const [hours, minutes] = shiftStartTime.split(":").map(Number);
  shiftStart.setHours(hours, minutes, 0, 0);

  const diffMs = checkInTime.getTime() - shiftStart.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60)));
}

export function calculateOvertimeMinutes(
  checkOutTime: Date,
  shiftEndTime: string
): number {
  const shiftEnd = new Date(checkOutTime);
  const [hours, minutes] = shiftEndTime.split(":").map(Number);
  shiftEnd.setHours(hours, minutes, 0, 0);

  const diffMs = checkOutTime.getTime() - shiftEnd.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60)));
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

/** تسجيل الحضور (الدخول) */
export async function recordCheckIn(params: {
  workerId: number;
  checkInTime?: Date;
  recordedBy: number;
}) {
  const checkInTime = params.checkInTime ?? new Date();
  const dateOnly = new Date(`${operationalDate(checkInTime)}T00:00:00Z`);

  const existing = await repo.findByWorkerAndDate(params.workerId, dateOnly);
  if (existing?.checkInTime && !existing.checkOutTime) {
    throw new AttendanceError("BAD_REQUEST", "تم تسجيل الحضور بالفعل اليوم");
  }

  const assignment = await repo.findWorkerAssignmentForDate(
    params.workerId,
    dateOnly,
    checkInTime,
  );
  const lateMinutes = assignment
    ? calculateLateMinutesFromAssignment(checkInTime, assignment)
    : 0;

  await repo.insertAttendance({
    workerId: params.workerId,
    attendanceDate: dateOnly,
    checkInTime,
    status: lateMinutes > 0 ? "late" : "present",
    recordedBy: params.recordedBy,
  });

  await createAuditLog(
    "attendance",
    1,
    "create",
    params.recordedBy,
    undefined,
    {
      workerId: params.workerId,
      checkInTime,
      lateMinutes,
      shiftAssignmentId: assignment?.id ?? null,
    },
    "تم تسجيل الحضور"
  );

  return { lateMinutes };
}

/** تسجيل الانصراف (الخروج) */
export async function recordCheckOut(params: {
  attendanceId?: number;
  workerId: number;
  checkOutTime?: Date;
  recordedBy: number;
}) {
  const checkOutTime = params.checkOutTime ?? new Date();
  const dateOnly = new Date(`${operationalDate(checkOutTime)}T00:00:00Z`);

  const record = params.attendanceId
    ? await repo.findById(params.attendanceId)
    : await repo.findByWorkerAndDate(params.workerId, dateOnly);

  if (!record) {
    throw new AttendanceError("NOT_FOUND", "لم يتم العثور على سجل الحضور");
  }

  if (record.checkOutTime) {
    throw new AttendanceError("BAD_REQUEST", "تم تسجيل الانصراف بالفعل");
  }
  if (record.checkInTime && checkOutTime < record.checkInTime) throw new AttendanceError("BAD_REQUEST", "وقت الانصراف يجب أن يكون بعد وقت الحضور");

  const assignment = await repo.findWorkerAssignmentForDate(
    record.workerId,
    getRiyadhDateOnly(record.attendanceDate),
    record.checkInTime ?? undefined,
  );
  const overtimeMinutes = assignment
    ? calculateOvertimeMinutesFromAssignment(checkOutTime, assignment)
    : 0;

  // احسب ساعات العمل الفعلية عند تسجيل الانصراف وخزّنها في السجل.
  // حقل DECIMAL في Drizzle يُحفظ كنص عشري، لذلك نستخدم toFixed(2).
  const actualHours = record.checkInTime
    ? Math.max(
        0,
        (checkOutTime.getTime() - record.checkInTime.getTime()) / (1000 * 60 * 60)
      ).toFixed(2)
    : "0.00";

  // لا نحول العامل المتأخر إلى present عند تسجيل الانصراف.
  // إذا وُجد عمل إضافي تكون له الأولوية، وإلا نحافظ على الحالة المسجلة عند الحضور.
  const finalStatus = overtimeMinutes > 0 ? "overtime" : record.status;

  await repo.updateAttendance(record.id, {
    checkOutTime,
    actualHours,
    status: finalStatus,
  });

  await createAuditLog(
    "attendance",
    record.id,
    "update",
    params.recordedBy,
    { checkOutTime: null, actualHours: record.actualHours, status: record.status },
    { checkOutTime, actualHours, overtimeMinutes, status: finalStatus },
    "تم تسجيل الانصراف"
  );

  return { overtimeMinutes, actualHours: Number(actualHours) };
}

/** سجلات الحضور ليوم معيّن (كل العمال) */
export async function getDailyAttendance(params: {
  date: Date;
  limit: number;
  offset: number;
  workerIds?: number[];
  departmentId?: number;
}) {
  const dateOnly = getRiyadhDateOnly(params.date);
  const nextDay = new Date(dateOnly);
  nextDay.setDate(nextDay.getDate() + 1);

  return repo.listByDate(dateOnly, nextDay, params.limit, params.offset, params.workerIds, params.departmentId);
}

/** سجل حضور عامل ليوم معيّن */
export async function getByDate(params: { workerId: number; date: Date }) {
  const dateOnly = getRiyadhDateOnly(params.date);
  return repo.findByWorkerAndDate(params.workerId, dateOnly);
}

/** سجلات حضور عامل لفترة زمنية */
export async function getByDateRange(params: {
  workerId: number;
  startDate: Date;
  endDate: Date;
  limit: number;
  offset: number;
}) {
  return repo.listByWorkerAndRange(
    params.workerId,
    params.startDate,
    params.endDate,
    { limit: params.limit, offset: params.offset }
  );
}

/** تقديم طلب تصحيح سجل حضور */
export async function correctAttendance(params: {
  attendanceId: number;
  correctedCheckInTime?: Date;
  correctedCheckOutTime?: Date;
  reason: string;
  referenceDocument?: string;
  correctedBy: number;
}) {
  const original = await repo.findById(params.attendanceId);
  if (!original) {
    throw new AttendanceError("NOT_FOUND", "سجل الحضور غير موجود");
  }

  await repo.insertCorrection({
    attendanceId: params.attendanceId,
    originalCheckIn: original.checkInTime,
    originalCheckOut: original.checkOutTime,
    correctedCheckIn: params.correctedCheckInTime,
    correctedCheckOut: params.correctedCheckOutTime,
    reason: params.reason,
    correctedBy: params.correctedBy,
  });

  await createAuditLog(
    "attendance_corrections",
    1,
    "create",
    params.correctedBy,
    undefined,
    { attendanceId: params.attendanceId, reason: params.reason },
    params.reason,
    params.referenceDocument
  );
}

/** طلبات تصحيح الحضور المعلقة */
export async function getPendingCorrections(workerIds?: number[]) {
  return repo.listPendingCorrections(workerIds);
}

/** اعتماد أو رفض طلب تصحيح */
export async function approveCorrection(params: {
  correctionId: number;
  approved: boolean;
  notes?: string;
  approvedBy: number;
}) {
  const correction = await repo.findCorrectionById(params.correctionId);
  if (!correction) {
    throw new AttendanceError("NOT_FOUND", "طلب التصحيح غير موجود");
  }

  // approvedBy غير فارغ يعني أن الطلب سبق التعامل معه (اعتمادًا أو رفضًا).
  if (correction.approvedBy) {
    throw new AttendanceError("BAD_REQUEST", "تم التعامل مع طلب التصحيح مسبقًا");
  }

  const originalAttendance = await repo.findById(correction.attendanceId);
  if (!originalAttendance) {
    throw new AttendanceError("NOT_FOUND", "سجل الحضور المرتبط بطلب التصحيح غير موجود");
  }

  if (params.approved) {
    const effectiveCheckIn =
      correction.correctedCheckIn || correction.originalCheckIn || originalAttendance.checkInTime;
    const effectiveCheckOut =
      correction.correctedCheckOut || correction.originalCheckOut || originalAttendance.checkOutTime;

    let actualHours = originalAttendance.actualHours;
    if (effectiveCheckIn && effectiveCheckOut) {
      actualHours = Math.max(
        0,
        (effectiveCheckOut.getTime() - effectiveCheckIn.getTime()) / (1000 * 60 * 60)
      ).toFixed(2);
    }

    // أعد تقييم الحالة من التكليف الفعلي للعامل في يوم السجل.
    let status = originalAttendance.status;
    const assignment = await repo.findWorkerAssignmentForDate(
      originalAttendance.workerId,
      getRiyadhDateOnly(originalAttendance.attendanceDate)
    );

    if (effectiveCheckIn) {
      const lateMinutes = assignment
        ? calculateLateMinutesFromAssignment(effectiveCheckIn, assignment)
        : 0;
      const overtimeMinutes =
        assignment && effectiveCheckOut
          ? calculateOvertimeMinutesFromAssignment(
              effectiveCheckOut,
              assignment
            )
          : 0;

      status =
        overtimeMinutes > 0
          ? "overtime"
          : lateMinutes > 0
            ? "late"
            : "present";
    }

    await repo.updateAttendance(correction.attendanceId, {
      checkInTime: effectiveCheckIn,
      checkOutTime: effectiveCheckOut,
      actualHours,
      status,
    });
  }

  await repo.markCorrectionApproved(params.correctionId, params.approvedBy);

  await createAuditLog(
    "attendance_corrections",
    params.correctionId,
    params.approved ? "approve" : "reject",
    params.approvedBy,
    undefined,
    {
      attendanceId: correction.attendanceId,
      approvedBy: params.approvedBy,
      approved: params.approved,
    },
    params.notes || `تم ${params.approved ? "اعتماد" : "رفض"} التصحيح`
  );
}

/** سجل الحضور الشهري لعامل */
export async function getMonthlyAttendance(params: {
  workerId: number;
  year: number;
  month: number;
}) {
  const monthStart = new Date(params.year, params.month - 1, 1);
  const monthEnd = new Date(params.year, params.month, 0, 23, 59, 59, 999);

  return repo.listByWorkerAndRange(params.workerId, monthStart, monthEnd);
}

/** حساب ساعات العمل اليومية لسجل حضور */
export async function calculateDailyHours(attendanceId: number) {
  const record = await repo.findById(attendanceId);
  if (!record) {
    throw new AttendanceError("NOT_FOUND", "سجل الحضور غير موجود");
  }

  if (!record.checkInTime || !record.checkOutTime) {
    return { hours: 0, message: "لم يتم تسجيل الانصراف بعد" };
  }

  const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
  const hours = diffMs / (1000 * 60 * 60);

  return { hours: parseFloat(hours.toFixed(2)), message: "تم حساب الساعات بنجاح" };
}

/** تحديد عامل كغائب */
export async function markAbsent(params: {
  workerId: number;
  date: Date;
  reason?: string;
  recordedBy: number;
}) {
  const dateOnly = getRiyadhDateOnly(params.date);

  const existing = await repo.findByWorkerAndDate(params.workerId, dateOnly);
  if (existing) {
    throw new AttendanceError(
      "BAD_REQUEST",
      "سجل حضور موجود بالفعل لهذا التاريخ"
    );
  }

  await repo.insertAttendance({
    workerId: params.workerId,
    attendanceDate: dateOnly,
    status: "absent",
    notes: params.reason || null,
    recordedBy: params.recordedBy,
  });

  await createAuditLog(
    "attendance",
    1,
    "create",
    params.recordedBy,
    undefined,
    { workerId: params.workerId, status: "absent", reason: params.reason },
    "تم تحديد الغياب"
  );
}

/** إحصائيات حضور عامل لفترة */
export async function getStats(params: {
  workerId: number;
  startDate: Date;
  endDate: Date;
}) {
  const records = await repo.listByWorkerAndRange(
    params.workerId,
    params.startDate,
    params.endDate
  );

  return {
    totalDays: records.length,
    presentDays: records.filter((r) => r.status === "present").length,
    lateDays: records.filter((r) => r.status === "late").length,
    absentDays: records.filter((r) => r.status === "absent").length,
    overtimeDays: records.filter((r) => r.status === "overtime").length,
    excusedDays: records.filter((r) => r.status === "excused").length,
  };
}
