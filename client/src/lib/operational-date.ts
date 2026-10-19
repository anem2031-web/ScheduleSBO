import { formatDateTime } from "@shared/display-format";
export { operationalDate, operationalDayBounds } from "@shared/operational-day";

/** Date keys used by date inputs are always Riyadh calendar dates. */
export function riyadhDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    numberingSystem: "latn",
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function riyadhTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return formatDateTime(
    value,
    {
      timeZone: "Asia/Riyadh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    "ar-SA",
  );
}
export function hoursLabel(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value.toFixed(2))} س`;
}
