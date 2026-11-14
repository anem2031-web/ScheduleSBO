export type ScheduleMessageFormat = "text" | "image" | "media";
export type ScheduleMessageLanguage = "ar" | "en";
export type ScheduleMessageOptions = { language: ScheduleMessageLanguage; format: ScheduleMessageFormat; workerName: string };

const englishLabels: Record<string, string> = {
  "إجازة أسبوعية": "Weekly day off", "إجازة سنوية": "Annual leave", "إجازة مرضية": "Sick leave",
  "إجازة رسمية": "Public holiday", "إجازة معتمدة": "Approved leave", "إجازة طارئة": "Emergency leave",
  "لم يُحدد الدوام": "Schedule not set", "تغيير حالة الدوام": "Schedule status changed", "تغيير وقت الدوام": "Working hours changed",
  "الأحد": "Sunday", "الاثنين": "Monday", "الثلاثاء": "Tuesday", "الأربعاء": "Wednesday", "الخميس": "Thursday", "الجمعة": "Friday", "السبت": "Saturday",
};

export const englishWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Keep stored snapshots language-neutral in practice: the existing Arabic values remain canonical. */
export function englishScheduleValue(value: string): string {
  return englishLabels[value] ?? value.replace(/^الفترة ([12]):/, "SHIFT $1:");
}

export function englishScheduleValues(values: string[]): string[] {
  return values.map(englishScheduleValue);
}

export function englishUpdateValues(values: string[]): string[] {
  return values.map(englishScheduleValue);
}

export function templateName(kind: "weekly" | "update", format: ScheduleMessageFormat): string {
  const base = kind === "weekly" ? "wardia_weekly_schedule" : "wardia_schedule_update";
  return format === "text" ? `${base}_en` : format === "image" ? `${base}_image` : `${base}_media_en`;
}
