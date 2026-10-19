import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  attendance,
  shiftAssignments,
  timeBalances,
  workerCalendar,
  workerScheduleSettings,
  workers,
  dayTypes,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Assignments Repository (S3) — استعلامات فقط
 * ============================================================================
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

const ACTIVE_STATUSES = ["planned", "confirmed", "completed"] as const;

export async function findAssignmentById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(shiftAssignments)
    .where(eq(shiftAssignments.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/** تكليفات العامل الفعالة في نافذة أيام (لاستخدام محرك التعارض والحد اليومي) */
export async function findActiveAssignmentsForWorker(
  workerId: number,
  fromDate: string,
  toDate_: string
) {
  const db = await requireDb();
  return db
    .select()
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.workerId, workerId),
        gte(shiftAssignments.workDate, toDate(fromDate)),
        lte(shiftAssignments.workDate, toDate(toDate_)),
        inArray(shiftAssignments.status, [...ACTIVE_STATUSES])
      )
    );
}

export async function listAssignments(filters: {
  periodId?: number;
  workerId?: number;
  workerIds?: number[];
  supervisorId?: number;
  workDate?: string;
  fromDate?: string;
  toDate?: string;
  includeCancelled?: boolean;
}) {
  const db = await requireDb();
  const conditions = [];
  if (filters.periodId)
    conditions.push(eq(shiftAssignments.periodId, filters.periodId));
  if (filters.workerId)
    conditions.push(eq(shiftAssignments.workerId, filters.workerId));
  if (filters.workerIds) {
    if (!filters.workerIds.length) return [];
    conditions.push(inArray(shiftAssignments.workerId, filters.workerIds));
  }
  if (filters.supervisorId)
    conditions.push(eq(shiftAssignments.supervisorId, filters.supervisorId));
  if (filters.workDate)
    conditions.push(eq(shiftAssignments.workDate, toDate(filters.workDate)));
  if (filters.fromDate)
    conditions.push(gte(shiftAssignments.workDate, toDate(filters.fromDate)));
  if (filters.toDate)
    conditions.push(lte(shiftAssignments.workDate, toDate(filters.toDate)));
  if (!filters.includeCancelled)
    conditions.push(ne(shiftAssignments.status, "cancelled"));
  return db
    .select()
    .from(shiftAssignments)
    .where(conditions.length ? and(...conditions) : undefined);
}

export async function insertAssignment(
  values: typeof shiftAssignments.$inferInsert
) {
  const db = await requireDb();
  const [res] = await db.insert(shiftAssignments).values(values).$returningId();
  return res.id;
}

export async function updateAssignment(
  id: number,
  values: Partial<typeof shiftAssignments.$inferInsert>
) {
  const db = await requireDb();
  return db
    .update(shiftAssignments)
    .set(values)
    .where(eq(shiftAssignments.id, id));
}

// ---------------------------------------------------------------------------
// بيانات العامل المساندة
// ---------------------------------------------------------------------------

export async function findWorkerById(workerId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findWorkerScheduleSettings(workerId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(workerScheduleSettings)
    .where(eq(workerScheduleSettings.workerId, workerId))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/** إدخالات تقويم العامل في تاريخ محدد مع نوع اليوم (لكشف الإجازات وأيام الراحة) */
export async function findWorkerCalendarForDate(
  workerId: number,
  date: string
) {
  const db = await requireDb();
  return db
    .select({
      id: workerCalendar.id,
      dayTypeId: workerCalendar.dayTypeId,
      reason: workerCalendar.reason,
      dayTypeCode: dayTypes.code,
      dayTypeNameAr: dayTypes.nameAr,
    })
    .from(workerCalendar)
    .innerJoin(dayTypes, eq(workerCalendar.dayTypeId, dayTypes.id))
    .where(
      and(
        eq(workerCalendar.workerId, workerId),
        eq(workerCalendar.date, toDate(date))
      )
    );
}

/** ضمان وجود نوع يوم بكوده وإرجاع معرفه (للإجازات) */
export async function ensureDayType(
  code: string,
  nameAr: string,
  nameEn: string
): Promise<number> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(dayTypes)
    .where(eq(dayTypes.code, code))
    .limit(1);
  if (rows.length > 0) return rows[0].id;
  const [res] = await db
    .insert(dayTypes)
    .values({ code, nameAr, nameEn })
    .$returningId();
  return res.id;
}

export async function insertWorkerCalendarEntry(
  values: typeof workerCalendar.$inferInsert
) {
  const db = await requireDb();
  const [res] = await db.insert(workerCalendar).values(values).$returningId();
  return res.id;
}

/** إدخالات تقويم العامل ضمن مدى تواريخ (مع نوع اليوم) */
export async function findWorkerCalendarInRange(
  workerId: number,
  fromDate: string,
  toDate_: string
) {
  const db = await requireDb();
  return db
    .select({
      id: workerCalendar.id,
      date: workerCalendar.date,
      dayTypeId: workerCalendar.dayTypeId,
      reason: workerCalendar.reason,
      dayTypeCode: dayTypes.code,
      dayTypeNameAr: dayTypes.nameAr,
    })
    .from(workerCalendar)
    .innerJoin(dayTypes, eq(workerCalendar.dayTypeId, dayTypes.id))
    .where(
      and(
        eq(workerCalendar.workerId, workerId),
        gte(workerCalendar.date, toDate(fromDate)),
        lte(workerCalendar.date, toDate(toDate_))
      )
    );
}

/** حذف إدخال تقويم بمعرفه (لإلغاء إجازة) */
export async function deleteWorkerCalendarEntry(entryId: number) {
  const db = await requireDb();
  return db.delete(workerCalendar).where(eq(workerCalendar.id, entryId));
}

export async function upsertWorkerScheduleSettings(
  workerId: number,
  values: Partial<typeof workerScheduleSettings.$inferInsert>
) {
  const db = await requireDb();
  const existing = await findWorkerScheduleSettings(workerId);
  if (existing) {
    await db
      .update(workerScheduleSettings)
      .set(values)
      .where(eq(workerScheduleSettings.id, existing.id));
    return existing.id;
  }
  const [res] = await db
    .insert(workerScheduleSettings)
    .values({
      workerId,
      requiredHoursPerDay: (values.requiredHoursPerDay as any) ?? "8",
      standardMonthlyHours: (values.standardMonthlyHours as any) ?? "208",
      maxDailyHours: (values.maxDailyHours as any) ?? "12",
      ...values,
    })
    .$returningId();
  return res.id;
}

/** كل إعدادات العمال (للترحيل الجماعي) */
export async function listAllScheduleSettings() {
  const db = await requireDb();
  return db.select().from(workerScheduleSettings);
}

/** دقائق الحضور الفعلية لكل يوم (خريطة yyyy-mm-dd -> دقائق) */
export async function findAttendanceActualMinutes(
  workerId: number,
  fromDate: string,
  toDate_: string
): Promise<Map<string, number>> {
  const db = await requireDb();
  const rows = await db
    .select({
      date: attendance.attendanceDate,
      hours: attendance.actualHours,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.workerId, workerId),
        gte(attendance.attendanceDate, toDate(fromDate)),
        lte(attendance.attendanceDate, toDate(toDate_))
      )
    );
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.hours === null || r.hours === undefined) continue;
    const ds = typeof r.date === "string" ? r.date : r.date.toISOString().slice(0, 10);
    map.set(ds, (map.get(ds) ?? 0) + Math.round(Number(r.hours) * 60));
  }
  return map;
}

/** العمال النشطون */
export async function listActiveWorkers() {
  const db = await requireDb();
  return db.select().from(workers).where(eq(workers.isActive, true));
}

// ---------------------------------------------------------------------------
// أرصدة الوقت
// ---------------------------------------------------------------------------

export async function findTimeBalance(workerId: number, periodId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(timeBalances)
    .where(
      and(
        eq(timeBalances.workerId, workerId),
        eq(timeBalances.periodId, periodId)
      )
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/** مجموع الدقائق المخططة الفعالة للعامل في فترة */
export async function sumScheduledMinutes(workerId: number, periodId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${shiftAssignments.plannedMinutes}), 0)`,
    })
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.workerId, workerId),
        eq(shiftAssignments.periodId, periodId),
        inArray(shiftAssignments.status, [...ACTIVE_STATUSES])
      )
    );
  return Number(rows[0]?.total ?? 0);
}

export async function upsertTimeBalance(values: {
  workerId: number;
  periodId: number;
  requiredMinutes: number;
  scheduledMinutes: number;
  executedMinutes: number;
}) {
  const db = await requireDb();
  const existing = await findTimeBalance(values.workerId, values.periodId);
  const remainingMinutes = Math.max(
    0,
    values.requiredMinutes - values.scheduledMinutes
  );
  if (existing) {
    await db
      .update(timeBalances)
      .set({
        requiredMinutes: values.requiredMinutes,
        scheduledMinutes: values.scheduledMinutes,
        executedMinutes: values.executedMinutes,
        remainingMinutes,
        lastRecalculatedAt: new Date(),
      })
      .where(eq(timeBalances.id, existing.id));
    return existing.id;
  }
  const [res] = await db
    .insert(timeBalances)
    .values({
      ...values,
      remainingMinutes,
      lastRecalculatedAt: new Date(),
    })
    .$returningId();
  return res.id;
}
