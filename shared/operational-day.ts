/** A Riyadh operational day is the half-open interval [04:30, next 04:30). */
export const OPERATIONAL_DAY_START_MINUTES = 4 * 60 + 30;
export const RIYADH_TIME_ZONE = "Asia/Riyadh";

export function riyadhParts(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("تاريخ غير صالح");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TIME_ZONE,
    numberingSystem: "latn",
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function operationalDate(
  value: Date | string | number = new Date(),
): string {
  const local = riyadhParts(value);
  if (local.minutes >= OPERATIONAL_DAY_START_MINUTES) return local.date;
  const prior = new Date(`${local.date}T00:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  return prior.toISOString().slice(0, 10);
}

export function operationalDayBounds(workDate: string) {
  const start = new Date(`${workDate}T04:30:00+03:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
    !Number.isFinite(start.getTime())
  )
    throw new Error("تاريخ غير صالح");
  return { start, endExclusive: new Date(start.getTime() + 86_400_000) };
}

/** Clocks before 04:30 belong to the following civil date of this operational day. */
export function operationalClockMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))
    throw new Error("أدخل الوقت بصيغة صحيحة");
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return minutes < OPERATIONAL_DAY_START_MINUTES ? minutes + 1440 : minutes;
}
