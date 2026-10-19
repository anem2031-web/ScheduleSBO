import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  attendance,
  attendanceCorrections,
  dayTypes,
  departments,
  overtimeReasons,
  overtimes,
  shiftAssignments,
  supervisorAssignments,
  workerCalendar,
  workerScheduleSettings,
  workers,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  return db;
}
const scoped = (
  column:
    | typeof workers.id
    | typeof attendance.workerId
    | typeof shiftAssignments.workerId
    | typeof overtimes.workerId,
  ids?: number[],
) =>
  ids === undefined
    ? undefined
    : ids.length
      ? inArray(column, ids)
      : sql`1 = 0`;

export async function supervisorWorkerIds(supervisorId: number, date: string) {
  const db = await database();
  const rows = await db
    .select({ id: supervisorAssignments.workerId })
    .from(supervisorAssignments)
    .where(
      and(
        eq(supervisorAssignments.supervisorId, supervisorId),
        sql`DATE(${supervisorAssignments.effectiveFrom}) <= ${date}`,
        or(
          isNull(supervisorAssignments.effectiveTo),
          sql`DATE(${supervisorAssignments.effectiveTo}) >= ${date}`,
        ),
      ),
    );
  return Array.from(new Set(rows.map((row) => row.id)));
}

export async function dayWorkers(ids?: number[]) {
  const db = await database();
  return db
    .select({
      id: workers.id,
      employeeId: workers.employeeId,
      name: workers.nameAr,
      department: departments.nameAr,
      requiredHours: workerScheduleSettings.requiredHoursPerDay,
      restDay: workerScheduleSettings.weeklyRestDay,
      costCenter: workerScheduleSettings.branch,
    })
    .from(workers)
    .leftJoin(departments, eq(workers.departmentId, departments.id))
    .leftJoin(
      workerScheduleSettings,
      eq(workers.id, workerScheduleSettings.workerId),
    )
    .where(
      and(
        eq(workers.isActive, true),
        inArray(workers.status, ["active", "on_leave"]),
        scoped(workers.id, ids),
      ),
    )
    .orderBy(workers.nameAr);
}

export async function dayAttendance(date: string, ids?: number[]) {
  const db = await database();
  return db
    .select()
    .from(attendance)
    .where(
      and(
        sql`${attendance.attendanceDate} = ${date}`,
        scoped(attendance.workerId, ids),
      ),
    );
}

export async function dayAssignments(date: string, ids?: number[]) {
  const db = await database();
  return db
    .select({
      workerId: shiftAssignments.workerId,
      plannedMinutes: shiftAssignments.plannedMinutes,
    })
    .from(shiftAssignments)
    .where(
      and(
        sql`${shiftAssignments.workDate} = ${date}`,
        inArray(shiftAssignments.status, ["planned", "confirmed", "completed"]),
        scoped(shiftAssignments.workerId, ids),
      ),
    );
}

export async function dayCalendar(date: string, ids?: number[]) {
  const db = await database();
  return db
    .select({ workerId: workerCalendar.workerId, code: dayTypes.code })
    .from(workerCalendar)
    .innerJoin(dayTypes, eq(workerCalendar.dayTypeId, dayTypes.id))
    .where(
      and(
        sql`${workerCalendar.date} = ${date}`,
        ids === undefined
          ? undefined
          : ids.length
            ? inArray(workerCalendar.workerId, ids)
            : sql`1 = 0`,
      ),
    );
}

export async function pendingCorrections(ids?: number[]) {
  const db = await database();
  return db
    .select({
      id: attendanceCorrections.id,
      workerId: attendance.workerId,
      name: workers.nameAr,
      employeeId: workers.employeeId,
      attendanceDate: attendance.attendanceDate,
      originalCheckIn: attendanceCorrections.originalCheckIn,
      originalCheckOut: attendanceCorrections.originalCheckOut,
      correctedCheckIn: attendanceCorrections.correctedCheckIn,
      correctedCheckOut: attendanceCorrections.correctedCheckOut,
      reason: attendanceCorrections.reason,
      createdAt: attendanceCorrections.createdAt,
    })
    .from(attendanceCorrections)
    .innerJoin(
      attendance,
      eq(attendanceCorrections.attendanceId, attendance.id),
    )
    .innerJoin(workers, eq(attendance.workerId, workers.id))
    .where(
      and(
        isNull(attendanceCorrections.approvedBy),
        scoped(attendance.workerId, ids),
      ),
    )
    .orderBy(desc(attendanceCorrections.createdAt));
}

export async function monthOvertimes(month: string, ids?: number[]) {
  const db = await database();
  const start = month + "-01";
  const end = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  return db
    .select({
      id: overtimes.id,
      workerId: overtimes.workerId,
      name: workers.nameAr,
      employeeId: workers.employeeId,
      date: overtimes.overtimeDate,
      hours: overtimes.hours,
      reason: overtimeReasons.reasonAr,
      status: overtimes.status,
      approvedBy: overtimes.approvedBy,
      approvedAt: overtimes.approvedAt,
    })
    .from(overtimes)
    .innerJoin(workers, eq(overtimes.workerId, workers.id))
    .leftJoin(overtimeReasons, eq(overtimes.reasonId, overtimeReasons.id))
    .where(
      and(
        sql`${overtimes.overtimeDate} >= ${start}`,
        sql`${overtimes.overtimeDate} <= ${end}`,
        scoped(overtimes.workerId, ids),
      ),
    )
    .orderBy(desc(overtimes.overtimeDate), desc(overtimes.id));
}
