import { and, eq, inArray } from "drizzle-orm";
import { overtimes } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { calendarOnOrAfter, calendarOnOrBefore } from "../../shared/calendar-date-sql";
type Client = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;
export async function approvedOvertimeMinutes(workerId: number, workDate: string, client?: Client) {
  const map = await approvedOvertimeForWorkers([workerId], workDate, workDate, client);
  return map.get(workerId)?.get(workDate) ?? 0;
}
export async function approvedOvertimeForWorkers(workerIds: number[], from: string, to: string, client?: Client) {
  const result = new Map<number, Map<string, number>>();
  const db = client ?? await getDb();
  if (!db || !workerIds.length) return result;
  const rows = await db.select().from(overtimes).where(and(inArray(overtimes.workerId, workerIds), eq(overtimes.status, "approved"), eq(overtimes.overtimeKind, "planned"), calendarOnOrAfter(overtimes.overtimeDate, from), calendarOnOrBefore(overtimes.overtimeDate, to)));
  for (const row of rows) {
    const day = typeof row.overtimeDate === "string" ? row.overtimeDate : row.overtimeDate.toISOString().slice(0, 10);
    const days = result.get(row.workerId) ?? new Map<string, number>();
    days.set(day, (days.get(day) ?? 0) + Math.round(Number(row.hours) * 60));
    result.set(row.workerId, days);
  }
  return result;
}
