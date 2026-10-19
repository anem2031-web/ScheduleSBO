import { sql, type AnyColumn } from "drizzle-orm";

/** MySQL DATE parameters must stay civil dates, independent of the server's local timezone. */
export const calendarDateKey = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export const calendarOnOrAfter = (column: AnyColumn, day: string | Date) => sql`${column} >= ${calendarDateKey(day)}`;
export const calendarOnOrBefore = (column: AnyColumn, day: string | Date) => sql`${column} <= ${calendarDateKey(day)}`;
export const calendarEquals = (column: AnyColumn, day: string | Date) => sql`${column} = ${calendarDateKey(day)}`;
