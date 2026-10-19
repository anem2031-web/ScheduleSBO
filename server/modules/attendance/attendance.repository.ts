import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  attendance,
  attendanceCorrections,
  shiftAssignments,
  workers,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { operationalClockMinutes, riyadhParts } from "../../../shared/operational-day";

/**
 * ============================================================================
 * Attendance Repository — استعلامات قاعدة البيانات فقط (بدون منطق عمل)
 * ============================================================================
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/**
 * يحول Date الممثل ليوم العمل إلى مفتاح DATE صريح.
 * هذا helper محصور فقط في الاستعلامين اللذين يبحثان بالمساواة على DATE.
 */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function findByWorkerAndDate(workerId: number, dateOnly: Date) {
  const db = await requireDb();
  const dateKey = toDateKey(dateOnly);

  const result = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workerId, workerId),
        sql`${attendance.attendanceDate} = ${dateKey}`
      )
    )
    .orderBy(desc(attendance.id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function findById(attendanceId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(attendance)
    .where(eq(attendance.id, attendanceId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * التكليف الفعلي للعامل في يوم العمل.
 * نستخدم snapshot الوقت داخل shift_assignments لأنه المصدر التنفيذي للجدول،
 * وليس جدول shifts القديم أو أول قالب وردية في النظام.
 */
export async function findWorkerAssignmentForDate(
  workerId: number,
  workDate: Date,
  checkInTime?: Date,
) {
  const db = await requireDb();
  const dateKey = toDateKey(workDate);

  const rows = await db
    .select()
    .from(shiftAssignments)
    .where(
      and(
        eq(shiftAssignments.workerId, workerId),
        sql`${shiftAssignments.workDate} = ${dateKey}`,
        inArray(shiftAssignments.status, ["planned", "confirmed", "completed"])
      )
    )
    .orderBy(asc(shiftAssignments.startTime));

  if (!checkInTime) return rows.length > 0 ? rows[0] : null;
  const civilMinutes = riyadhParts(checkInTime).minutes;
  const minutes = civilMinutes < 270 ? civilMinutes + 1440 : civilMinutes;
  return rows.sort((a, b) => Math.abs(operationalClockMinutes(a.startTime) - minutes) - Math.abs(operationalClockMinutes(b.startTime) - minutes))[0] ?? null;
}

export async function insertAttendance(values: typeof attendance.$inferInsert) {
  const db = await requireDb();
  return db.insert(attendance).values(values);
}

export async function updateAttendance(
  attendanceId: number,
  values: Partial<typeof attendance.$inferInsert>
) {
  const db = await requireDb();
  return db.update(attendance).set(values).where(eq(attendance.id, attendanceId));
}

export async function listByDate(
  dateOnly: Date,
  nextDay: Date,
  limit: number,
  offset: number,
  workerIds?: number[],
  departmentId?: number,
) {
  const db = await requireDb();
  return db
    .select()
    .from(attendance)
    .where(
      and(
        gte(attendance.attendanceDate, dateOnly),
        lt(attendance.attendanceDate, nextDay),
        workerIds === undefined ? undefined : workerIds.length ? inArray(attendance.workerId, workerIds) : sql`1 = 0`,
        departmentId === undefined ? undefined : inArray(attendance.workerId, db.select({ id: workers.id }).from(workers).where(eq(workers.departmentId, departmentId))),
      )
    )
    .limit(limit)
    .offset(offset);
}

export async function listByWorkerAndRange(
  workerId: number,
  startDate: Date,
  endDate: Date,
  options?: { limit?: number; offset?: number }
) {
  const db = await requireDb();
  let query = db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workerId, workerId),
        gte(attendance.attendanceDate, startDate),
        lte(attendance.attendanceDate, endDate)
      )
    )
    .orderBy(desc(attendance.attendanceDate));

  if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as typeof query;
  }
  return query;
}

export async function insertCorrection(
  values: typeof attendanceCorrections.$inferInsert
) {
  const db = await requireDb();
  return db.insert(attendanceCorrections).values(values);
}

export async function findCorrectionById(correctionId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(attendanceCorrections)
    .where(eq(attendanceCorrections.id, correctionId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function listPendingCorrections(workerIds?: number[]) {
  const db = await requireDb();
  return db
    .select()
    .from(attendanceCorrections)
    .where(and(isNull(attendanceCorrections.approvedBy), workerIds === undefined ? undefined : workerIds.length ? inArray(attendanceCorrections.attendanceId, db.select({ id: attendance.id }).from(attendance).where(inArray(attendance.workerId, workerIds))) : sql`1 = 0`))
    .orderBy(desc(attendanceCorrections.createdAt));
}

export async function markCorrectionApproved(
  correctionId: number,
  approvedBy: number
) {
  const db = await requireDb();
  return db
    .update(attendanceCorrections)
    .set({ approvedBy, approvedAt: new Date() })
    .where(eq(attendanceCorrections.id, correctionId));
}
