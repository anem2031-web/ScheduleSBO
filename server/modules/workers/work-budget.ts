import { addCalendarDays, sundayOf } from "../../../shared/weekly-schedule";

/** Local calendar date strings remain timezone independent. The roster week starts Sunday. */
export function workerWeekBounds(refDate: string) {
  const startDate = sundayOf(refDate);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${addCalendarDays(startDate, 6)}T00:00:00Z`);
  return { start, end };
}

export function excludesRequiredHours(dayTypeCode: string) {
  return [
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
  ].includes(dayTypeCode.toUpperCase());
}

/** A default daily ceiling follows the budget; a separately configured ceiling is preserved. */
export function revisedDailyLimit(
  previousRequired: number | null,
  previousLimit: number | null,
  nextRequired: number,
): number | null {
  if (
    previousRequired === null ||
    previousLimit === null ||
    previousLimit === previousRequired
  )
    return nextRequired;
  return nextRequired <= previousLimit ? previousLimit : null;
}

/** Attendance is never synthesized from a planned shift. Approval requires a separate source. */
export function summarizeWorkBudget(input: {
  dates: string[];
  dailyMinutes: number;
  isWorkingDay: (date: string) => boolean;
  scheduledByDate: Map<string, number>;
  actualByDate: Map<string, number>;
  excusedMinutesByDate?: Map<string, number>;
  approvedByDate?: Map<string, number>;
  refDate: string;
}) {
  const requiredMinutes = input.dates.reduce((sum, date) => sum + (input.isWorkingDay(date) ? Math.max(0, input.dailyMinutes - (input.excusedMinutesByDate?.get(date) ?? 0)) : 0), 0);
  const scheduledMinutes = input.dates.reduce(
    (sum, date) => sum + (input.scheduledByDate.get(date) ?? 0),
    0,
  );
  const actualMinutes = input.dates.reduce(
    (sum, date) =>
      sum + (date <= input.refDate ? (input.actualByDate.get(date) ?? 0) : 0),
    0,
  );
  return {
    requiredMinutes,
    scheduledMinutes,
    actualMinutes,
    approvedMinutes: input.approvedByDate ? input.dates.reduce((sum, date) => sum + (date <= input.refDate ? input.approvedByDate!.get(date) ?? 0 : 0), 0) : null,
    doneMinutes: actualMinutes, // Compatibility for existing readers, now backed only by attendance.
    remainingMinutes: Math.max(0, requiredMinutes - scheduledMinutes),
  };
}
