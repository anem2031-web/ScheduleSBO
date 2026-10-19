import { operationalClockMinutes } from "../../../shared/operational-day";
const endMinute = (clock: string) => clock.slice(0, 5) === "04:30" ? 1710 : operationalClockMinutes(clock);
export function overtimeExtensionMinutes(originalEnd: string, requestedEnd: string) {
  const minutes = endMinute(requestedEnd) - endMinute(originalEnd);
  if (minutes <= 0 || minutes > 720) throw new Error("حدد نهاية لاحقة ضمن اليوم التشغيلي، وبزيادة لا تتجاوز 12 ساعة");
  return minutes;
}
export function shiftInstant(workDate: string, clock: string) {
  return new Date(`${workDate}T00:00:00+03:00`).getTime() + operationalClockMinutes(clock) * 60_000;
}
export function overrunMinutes(checkOut: Date, workDate: string, endTime: string) {
  return Math.max(0, Math.floor((checkOut.getTime() - shiftEndInstant(workDate, endTime)) / 60_000));
}
export function shiftEndInstant(workDate: string, clock: string) { return new Date(`${workDate}T00:00:00+03:00`).getTime() + endMinute(clock) * 60_000; }
export function actualRegularMinutes(checkIn: Date, checkOut: Date, assignments: { workDate: string; startTime: string; endTime: string }[]) {
  return assignments.reduce((sum, a) => sum + Math.max(0, Math.floor((Math.min(checkOut.getTime(), shiftEndInstant(a.workDate, a.endTime)) - Math.max(checkIn.getTime(), shiftInstant(a.workDate, a.startTime))) / 60_000)), 0);
}
