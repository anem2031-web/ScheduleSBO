import { TRPCError } from "@trpc/server";
import * as repo from "./operations.repository";
import { hasPermission, ATTENDANCE_APPROVE } from "../../shared/rbac";
import type { AuthorizedUser } from "../../shared/rbac";
import { getScopedWorkerIds } from "../../shared/worker-scope";
import { approvedAbsencesForWorkers, permissionOverlapMinutes, type ApprovedAbsence } from "../leaves/approved-absence";
import { shiftInstant } from "../overtime/overtime.rules";

type Viewer = Pick<AuthorizedUser, "id" | "role" | "permissions" | "accessScope" | "workerId">;
const dailyRoles = ["admin", "hr_admin", "supervisor", "guard", "modifier"];
const reviewRoles = ["admin", "hr_admin", "supervisor", "modifier"];

export function assertDay(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(new Date(date + "T00:00:00Z").getTime()) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "اختر تاريخًا صحيحًا",
    });
  }
}

export async function scopeFor(viewer: Viewer, date: string, reviews = false) {
  const roles = reviews ? reviewRoles : dailyRoles;
  const permitted = reviews
    ? hasPermission(viewer, ATTENDANCE_APPROVE) || hasPermission(viewer, "attendance:read") || hasPermission(viewer, "overtime:read")
    : hasPermission(viewer, "attendance:read");
  if (!roles.includes(viewer.role) || !permitted)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه المتابعة غير متاحة لصلاحية حسابك",
    });
  if (viewer.accessScope || viewer.role === "worker") return getScopedWorkerIds(viewer, date);
  return viewer.role === "supervisor"
    ? repo.supervisorWorkerIds(viewer.id, date)
    : undefined;
}

type WorkerRow = Awaited<ReturnType<typeof repo.dayWorkers>>[number];
type PunchRow = Awaited<ReturnType<typeof repo.dayAttendance>>[number];
type AssignmentRow = Awaited<ReturnType<typeof repo.dayAssignments>>[number];
type CalendarRow = Awaited<ReturnType<typeof repo.dayCalendar>>[number];

export function buildDailyRows(
  workerRows: WorkerRow[],
  punches: PunchRow[],
  assignments: (Pick<AssignmentRow, "workerId" | "plannedMinutes"> & Partial<Pick<AssignmentRow, "startTime" | "endTime">>)[],
  date: string,
  calendar: CalendarRow[] = [],
  absences: Map<number, ApprovedAbsence> = new Map(),
) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return workerRows.map((worker) => {
    const records = punches
      .filter((row) => row.workerId === worker.id)
      .sort((a, b) => b.id - a.id);
    const attended = records.some((row) => row.checkInTime != null);
    const onSite = records.some(
      (row) => row.checkInTime != null && row.checkOutTime == null,
    );
    const completed = records.filter(
      (row) => row.checkInTime && row.checkOutTime,
    );
    const periods = assignments.filter((row) => row.workerId === worker.id);
    const permissions = absences.get(worker.id)?.permissions ?? [];
    const excused = absences.get(worker.id)?.excusedMinutesByDate.get(date) ?? 0;
    const plannedHours = periods.reduce((sum, row) => sum + Math.max(0, row.plannedMinutes -
      (row.startTime && row.endTime ? permissionOverlapMinutes(row.startTime, row.endTime, permissions) : 0)), 0) / 60;
    const requiredHours =
      worker.requiredHours == null ? null : Math.max(0, Number(worker.requiredHours) - excused / 60);
    // A completed overtime record can also have arrived late. A single status
    // cannot represent both; derive lateness from the punch and closest period.
    const starts = periods.filter((row) => row.startTime).map((row) => shiftInstant(date, row.startTime!));
    const isLate = records.some((row) => {
      if (!row.checkInTime || !starts.length) return row.status === "late";
      const instant = new Date(row.checkInTime).getTime();
      const closest = starts.reduce((best, start) => Math.abs(start - instant) < Math.abs(best - instant) ? start : best);
      return instant - closest >= 60_000;
    });
    const calendarCodes = calendar
      .filter((row) => row.workerId === worker.id)
      .map((row) => row.code.toUpperCase());
    const isRestDay =
      worker.restDay === weekday ||
      calendarCodes.some((code) =>
        ["REST", "REST_DAY", "WEEKLY_REST"].includes(code),
      );
    const isHolidayDay = calendarCodes.some((code) =>
      ["HOLIDAY", "PUBLIC_HOLIDAY"].includes(code),
    );
    const isLeaveDay = calendar.some(
      (row) =>
        row.workerId === worker.id &&
        [
          "ANNUAL_LEAVE",
          "SICK_LEAVE",
          "EMERGENCY_LEAVE",
          "UNPAID_LEAVE",
          "LEAVE",
        ].includes(row.code.toUpperCase()),
    );
    return {
      ...worker,
      requiredHours,
      plannedHours,
      isRestDay,
      isLeaveDay,
      isHolidayDay,
      attended,
      onSite,
      isLate,
      actualHours:
        completed.length && completed.every((row) => row.actualHours !== null)
          ? completed.reduce((sum, row) => sum + Number(row.actualHours), 0)
          : null,
      remainingToSchedule:
        requiredHours === null
          ? null
          : Math.max(
              0,
              (isRestDay || isLeaveDay || isHolidayDay ? 0 : requiredHours) -
                plannedHours,
            ),
      status: records[0]?.status ?? null,
      checkIn:
        records.filter((row) => row.checkInTime).at(-1)?.checkInTime ?? null,
      checkOut: onSite
        ? null
        : (records.find((row) => row.checkOutTime)?.checkOutTime ?? null),
    };
  });
}

export async function dailyOverview(viewer: Viewer, date: string) {
  assertDay(date);
  const ids = await scopeFor(viewer, date);
  const [workers, punches, assignments, calendar] = await Promise.all([
    repo.dayWorkers(ids),
    repo.dayAttendance(date, ids),
    repo.dayAssignments(date, ids),
    repo.dayCalendar(date, ids),
  ]);
  const absences = await approvedAbsencesForWorkers(workers.map((worker) => worker.id), date, date);
  const rows = buildDailyRows(workers, punches, assignments, date, calendar, absences);
  return {
    rows,
    summary: {
      workers: rows.length,
      attended: rows.filter((row) => row.attended).length,
      onSite: rows.filter((row) => row.onSite).length,
      late: rows.filter((row) => row.isLate).length,
      incompleteSetup: rows.filter(
        (row) => row.requiredHours == null || row.restDay == null,
      ).length,
    },
  };
}

export async function reviewQueue(
  viewer: Viewer,
  month: string,
  today: string,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new TRPCError({ code: "BAD_REQUEST", message: "اختر شهرًا صحيحًا" });
  const ids = await scopeFor(viewer, today, true);
  const [corrections, overtimes] = await Promise.all([
    hasPermission(viewer, "attendance:read") || hasPermission(viewer, ATTENDANCE_APPROVE) ? repo.pendingCorrections(ids) : Promise.resolve([]),
    hasPermission(viewer, "overtime:read") || hasPermission(viewer, "overtime:approve") ? repo.monthOvertimes(month, ids) : Promise.resolve([]),
  ]);
  return {
    corrections,
    overtimes,
    canApproveCorrections: hasPermission(viewer, ATTENDANCE_APPROVE),
  };
}
