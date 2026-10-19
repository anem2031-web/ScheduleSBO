import { isCalendarDate } from "../../../shared/weekly-schedule";

type CalendarDate = string | Date;
type CalendarEntry = {
  workerId: number;
  date: CalendarDate;
  requestId?: number | null;
  code?: string | null;
  label: string;
};
type AnnualLeaveRequest = {
  id: number;
  workerId: number;
  leaveKind: string | null;
  status: string;
  startDate: CalendarDate | null;
  endDate?: CalendarDate | null;
};
export type AnnualLeaveDisplay = {
  annualLeaveStartDate?: string;
  annualLeaveDay?: number;
};

function dateKey(value: CalendarDate | null | undefined): string | undefined {
  const key =
    value instanceof Date
      ? Number.isFinite(value.getTime())
        ? value.toISOString().slice(0, 10)
        : undefined
      : typeof value === "string"
        ? value.slice(0, 10)
        : undefined;
  return key && isCalendarDate(key) ? key : undefined;
}

/** The first calendar date of leave is V1, independently of the displayed week. */
export function annualLeaveDayNumber(
  date: CalendarDate,
  startDate: CalendarDate,
): number | undefined {
  const day = dateKey(date),
    start = dateKey(startDate);
  if (!day || !start || day < start) return undefined;
  return (
    Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

/**
 * Enrich only calendar entries linked to their original approved annual request.
 * A visible week's first entry is never used as a substitute leave start date.
 * Legacy entries without a complete source retain their descriptive label.
 */
export function enrichAnnualLeaveCalendar<T extends CalendarEntry>(
  rows: readonly T[],
  approvedRequests: readonly AnnualLeaveRequest[],
): Array<T & AnnualLeaveDisplay> {
  const requests = new Map(
    approvedRequests.map((request) => [request.id, request]),
  );
  const enriched: Array<T & AnnualLeaveDisplay> = rows.map((row) => {
    if (row.code !== "ANNUAL_LEAVE" || !row.requestId) return { ...row };
    const request = requests.get(row.requestId);
    if (
      !request ||
      request.workerId !== row.workerId ||
      request.status !== "approved" ||
      request.leaveKind !== "annual"
    )
      return { ...row };
    const start = dateKey(request.startDate),
      end = dateKey(request.endDate),
      day = dateKey(row.date);
    if (!start || !end || !day || end < start || day < start || day > end)
      return { ...row };
    const count = annualLeaveDayNumber(day, start)!;
    return {
      ...row,
      label: `${row.label} V${count}`,
      annualLeaveStartDate: start,
      annualLeaveDay: count,
    };
  });
  // A dated rest or holiday exception may predate a subsequently approved leave.
  // Leave takes display precedence on that date, without deleting either source
  // entry or changing attendance, leave entitlement, or work-budget calculations.
  const priority = (row: CalendarEntry) =>
    row.code?.toUpperCase().includes("LEAVE") ? 0 : 1;
  return enriched
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        (dateKey(a.row.date) ?? "9999-99-99").localeCompare(
          dateKey(b.row.date) ?? "9999-99-99",
        ) ||
        priority(a.row) - priority(b.row) ||
        a.index - b.index,
    )
    .map(({ row }) => row);
}
