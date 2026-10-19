import { z } from "zod";
import { addCalendarDays, isCalendarDate } from "../../../shared/weekly-schedule";

export const leaveDaySchema = z.string().refine(isCalendarDate, "اختر تاريخًا صحيحًا");
export const leaveTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "أدخل الوقت بصيغة HH:MM");
export const leaveInputSchema = z.object({
  workerId: z.number().int().positive(),
  leaveKind: z.enum(["sick", "annual", "permission"]),
  startDate: leaveDaySchema,
  endDate: leaveDaySchema,
  startTime: leaveTimeSchema.nullable().optional(),
  endTime: leaveTimeSchema.nullable().optional(),
  reason: z.string().trim().min(3, "اكتب سبب الطلب في 3 أحرف على الأقل").max(2000),
}).superRefine((value, ctx) => {
  if (value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "تاريخ النهاية يسبق البداية" });
  if (isCalendarDate(value.startDate) && isCalendarDate(value.endDate) && value.endDate > addCalendarDays(value.startDate, 365))
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "الحد الأقصى للطلب سنة واحدة" });
  if (value.leaveKind === "permission") {
    if (value.startDate !== value.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "حدد الاستئذان ضمن يوم تشغيلي واحد" });
    if (!value.startTime || !value.endTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "حدد بداية الاستئذان ونهايته" });
    else if (operationalEndMinute(value.endTime) <= operationalMinute(value.startTime))
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "نهاية الاستئذان يجب أن تلي بدايته ضمن اليوم التشغيلي 04:30–04:29" });
  }
});
export type LeaveInput = z.infer<typeof leaveInputSchema>;
export function operationalMinute(time: string) {
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return minutes < 270 ? minutes + 1440 : minutes;
}
export function permissionMinutes(start: string, end: string) {
  return operationalEndMinute(end) - operationalMinute(start);
}
export function operationalEndMinute(time: string) { return time.slice(0, 5) === "04:30" ? 1710 : operationalMinute(time); }
export function leaveDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let day = startDate; day <= endDate; day = addCalendarDays(day, 1)) dates.push(day);
  return dates;
}
export function requestsOverlap(a: { leaveKind: string | null; startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }, b: { leaveKind: string | null; startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }) {
  if (a.startDate > b.endDate || b.startDate > a.endDate) return false;
  if (a.leaveKind !== "permission" || b.leaveKind !== "permission") return true;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return true;
  return operationalMinute(a.startTime) < operationalEndMinute(b.endTime) && operationalMinute(b.startTime) < operationalEndMinute(a.endTime);
}
export function requestTransition(status: string, action: "approve" | "reject" | "cancel" | "edit") {
  if (action === "cancel") return status === "pending" || status === "approved";
  return status === "pending";
}
