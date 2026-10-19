import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { requests } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { calendarOnOrAfter, calendarOnOrBefore } from "../../shared/calendar-date-sql";
import { operationalEndMinute, operationalMinute, permissionMinutes } from "./leaves.rules";

type QueryClient = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;
const key = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export async function approvedAbsenceForRange(workerId: number, fromDate: string, toDate: string, client?: QueryClient) {
  const results = await approvedAbsencesForWorkers([workerId], fromDate, toDate, client);
  return results.get(workerId) ?? { permissions: [], excusedMinutesByDate: new Map<string, number>() };
}
export type ApprovedAbsence = { permissions: { id: number; workDate: string; startTime: string; endTime: string; mode: "excused" | "make_up" | null; minutes: number }[]; excusedMinutesByDate: Map<string, number> };
export async function approvedAbsencesForWorkers(workerIds: number[], fromDate: string, toDate: string, client?: QueryClient) {
  const db = client ?? await getDb();
  const results = new Map<number, ApprovedAbsence>();
  if (!db || !workerIds.length) return results;
  const rows = await db.select().from(requests).where(and(inArray(requests.workerId, workerIds), eq(requests.leaveKind, "permission"), eq(requests.status, "approved"), calendarOnOrAfter(requests.startDate, new Date(`${fromDate}T00:00:00Z`)), calendarOnOrBefore(requests.startDate, new Date(`${toDate}T00:00:00Z`))));
  for (const row of rows.filter((row) => row.startDate && row.startTime && row.endTime)) {
    const result = results.get(row.workerId) ?? { permissions: [], excusedMinutesByDate: new Map<string, number>() };
    const workDate = key(row.startDate!);
    const minutes = permissionMinutes(row.startTime!, row.endTime!);
    if (row.permissionMode === "excused") result.excusedMinutesByDate.set(workDate, (result.excusedMinutesByDate.get(workDate) ?? 0) + minutes);
    result.permissions.push({ id: row.id, workDate, startTime: row.startTime!, endTime: row.endTime!, mode: row.permissionMode, minutes });
    results.set(row.workerId, result);
  }
  return results;
}
export async function validateApprovedPermissionOverlap(workerId: number, workDate: string, intervals: { startTime: string; endTime: string }[], client?: QueryClient) {
  const { permissions } = await approvedAbsenceForRange(workerId, workDate, workDate, client);
  for (const interval of intervals) {
    const start = operationalMinute(interval.startTime), end = operationalEndMinute(interval.endTime);
    if (permissions.some((p) => start < operationalEndMinute(p.endTime) && operationalMinute(p.startTime) < end))
      throw new TRPCError({ code: "CONFLICT", message: "الفترة تتداخل مع استئذان معتمد؛ عدّل وقت العمل أو ألغ الاستئذان أولًا" });
  }
}
export function permissionOverlapMinutes(startTime: string, endTime: string, permissions: { startTime: string; endTime: string }[]) {
  const start = operationalMinute(startTime), end = operationalEndMinute(endTime);
  return permissions.reduce((sum, p) => sum + Math.max(0, Math.min(end, operationalEndMinute(p.endTime)) - Math.max(start, operationalMinute(p.startTime))), 0);
}
