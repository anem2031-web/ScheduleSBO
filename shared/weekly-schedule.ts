import { operationalDate, operationalClockMinutes } from "./operational-day";
/** Calendar-only dates: never convert a browser's local midnight to UTC. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function addCalendarDays(value: string, days: number): string {
  if (!isCalendarDate(value)) throw new Error("تاريخ غير صالح");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The roster week is Sunday–Saturday; weekday numbers remain JavaScript's Sunday = 0. */
export function sundayOf(value: string): string {
  if (!isCalendarDate(value)) throw new Error("تاريخ غير صالح");
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  return addCalendarDays(value, -weekday);
}

export function riyadhToday(): string {
  return operationalDate();
}

export type DirectInterval = {
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  /** Omitted values use the worker's usual work destination. */
  costCenterId?: number;
  locationId?: number;
  departmentId?: number;
  jobTitleId?: number | null;
};
export type TimeInterval = Pick<DirectInterval, "startTime" | "endTime" | "breakMinutes">;
export function directIntervalMinutes(interval: TimeInterval): number {
  const valid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!valid(interval.startTime) || !valid(interval.endTime))
    throw new Error("أدخل الوقت بصيغة صحيحة");
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(interval.startTime),
    end = minutes(interval.endTime);
  if (start === end) throw new Error("وقت البداية والنهاية متساويان");
  return end > start ? end - start : 1440 - start + end;
}

/** Breaks are attendance time, never working minutes. A daily break is 30 minutes. */
export function intervalWorkMinutes(interval: TimeInterval): number {
  const elapsed = directIntervalMinutes(interval);
  const rest = interval.breakMinutes ?? 0;
  if (![0, 30].includes(rest) || rest >= elapsed)
    throw new Error("الراحة تكون 0 أو 30 دقيقة ويجب أن تقل عن مدة الفترة");
  return elapsed - rest;
}

/** All intervals must fit in the selected operational day, including after midnight. */
export function assertOperationalInterval(interval: TimeInterval): void {
  const start = operationalClockMinutes(interval.startTime);
  const end = start + directIntervalMinutes(interval);
  if (end > 1440 + 270)
    throw new Error(
      "يجب أن تنتهي الفترة قبل بداية اليوم التشغيلي التالي عند 04:30",
    );
  intervalWorkMinutes(interval);
}

export function intervalOverlapMinutes(
  interval: TimeInterval,
  absences: TimeInterval[],
): number {
  const start = operationalClockMinutes(interval.startTime),
    end = start + directIntervalMinutes(interval);
  return absences.reduce((sum, absence) => {
    const otherStart = operationalClockMinutes(absence.startTime),
      otherEnd = otherStart + directIntervalMinutes(absence);
    return (
      sum + Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart))
    );
  }, 0);
}

export const WEEK_DAY_NAMES = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

export function activeSupervisorLink(
  link: { effectiveFrom: string; effectiveTo: string | null },
  date: string,
): boolean {
  return (
    link.effectiveFrom <= date &&
    (!link.effectiveTo || link.effectiveTo >= date)
  );
}
