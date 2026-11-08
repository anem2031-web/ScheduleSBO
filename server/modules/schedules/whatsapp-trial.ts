import { and, eq, inArray } from "drizzle-orm";
import { schedulePeriods, shiftAssignments, workers } from "../../../drizzle/schema";
import { normalizeWorkerPhone } from "../../../shared/worker-phone";
import { addCalendarDays } from "../../../shared/weekly-schedule";
import { getDb } from "../../shared/db";

export type TrialSendReport = {
  mode: "disabled" | "test";
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  note: string;
};

const ACTIVE_ASSIGNMENTS = ["planned", "confirmed", "completed"] as const;
const GRAPH_VERSION = "v25.0";

function recipientNumber(raw: string | null): string | null {
  if (!raw) return null;
  const value = normalizeWorkerPhone(raw);
  return /^\+[1-9]\d{6,14}$/.test(value) ? value.slice(1) : null;
}

export function trialConfig() {
  const allowed = (process.env.WHATSAPP_TRIAL_RECIPIENTS ?? "")
    .split(",")
    .map((number) => recipientNumber(number))
    .filter((number): number is string => number !== null);
  const unique = Array.from(new Set(allowed));
  const enabled = process.env.WHATSAPP_TRIAL_ENABLED === "true";
  if (unique.length > 5) throw new Error("رقم Meta التجريبي يقبل خمسة مستلمين فقط");
  return {
    enabled,
    recipients: new Set(unique),
    phoneId: process.env.WHATSAPP_TRIAL_PHONE_NUMBER_ID?.trim() ?? "",
    token: process.env.WHATSAPP_TRIAL_ACCESS_TOKEN?.trim() ?? "",
    approvedTemplate: process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED === "true"
      ? process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME?.trim() ?? "" : "",
  };
}

type ScheduleTemplateValues = { name: string; start: string; end: string; details: string };

export function formatTrialSchedule(start: string, end: string, rows: Array<{ date: string; from: string; to: string }>): string {
  const byDate = new Map<string, string[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), `${row.from.slice(0, 5)}–${row.to.slice(0, 5)}`]);
  const lines: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) {
    lines.push(`${date}: ${byDate.get(date)?.join("، ") ?? "غير مجدول / Unscheduled"}`);
    if (lines.length > 31) break;
  }
  return lines.join("\n");
}

export async function sendTrialTemplate(to: string, schedule?: ScheduleTemplateValues): Promise<boolean> {
  const config = trialConfig();
  if (!config.enabled || !config.phoneId || !config.token || !config.recipients.has(to)) return false;
  if (!/^\d{8,20}$/.test(config.phoneId)) throw new Error("معرّف رقم Meta التجريبي غير صالح");
  const useScheduleTemplate = !!config.approvedTemplate && !!schedule;
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: useScheduleTemplate
        ? {
          name: config.approvedTemplate, language: { code: "ar" },
          components: [{ type: "body", parameters: [schedule!.name, schedule!.start, schedule!.end, schedule!.details].map((text) => ({ type: "text", text })) }],
        }
        : { name: "hello_world", language: { code: "en_US" } },
    }),
    signal: AbortSignal.timeout(12000),
  });
  // Never include Meta's error body: it can contain phone numbers or other private data.
  if (!response.ok) throw new Error(`تعذر الإرسال التجريبي عبر Meta (${response.status})`);
  return true;
}

/** Manual connectivity probe; sends only the fixed Meta test template, never worker data. */
export async function sendTrialProbe(recipientIndex: number): Promise<void> {
  const config = trialConfig();
  const target = Array.from(config.recipients)[recipientIndex];
  if (!config.enabled || !config.phoneId || !config.token || !target) throw new Error("إرسال واتساب التجريبي غير جاهز أو المستلم غير متاح");
  await sendTrialTemplate(target);
}

/** Only approved-period workers whose phone is explicitly allowlisted can receive a test message. */
export async function sendTrialForPublishedPeriod(periodId: number): Promise<TrialSendReport> {
  const config = trialConfig();
  const unavailable = !config.enabled || !config.phoneId || !config.token || !config.recipients.size;
  if (unavailable) return { mode: "disabled", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "إرسال واتساب التجريبي غير مفعّل" };
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [period] = await db.select({ startDate: schedulePeriods.startDate, endDate: schedulePeriods.endDate, status: schedulePeriods.status })
    .from(schedulePeriods).where(eq(schedulePeriods.id, periodId)).limit(1);
  if (!period) throw new Error("الأسبوع غير موجود");
  if (period.status !== "published") throw new Error("لا تُرسل التجربة قبل اعتماد الأسبوع");
  const dateKey = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const start = dateKey(period.startDate), end = dateKey(period.endDate);
  const rows = await db.select({ id: workers.id, phone: workers.phoneNumber, name: workers.nameAr,
    workDate: shiftAssignments.workDate, startTime: shiftAssignments.startTime, endTime: shiftAssignments.endTime })
    .from(shiftAssignments)
    .innerJoin(workers, eq(workers.id, shiftAssignments.workerId))
    .where(and(eq(shiftAssignments.periodId, periodId), inArray(shiftAssignments.status, [...ACTIVE_ASSIGNMENTS]), eq(workers.isActive, true)));
  const unique = new Map<number, { phone: string | null; name: string; rows: Array<{ date: string; from: string; to: string }> }>();
  for (const row of rows) {
    const item = unique.get(row.id) ?? { phone: recipientNumber(row.phone), name: row.name, rows: [] };
    item.rows.push({ date: dateKey(row.workDate), from: row.startTime, to: row.endTime });
    unique.set(row.id, item);
  }
  const recipients = Array.from(new Map(Array.from(unique.values())
    .filter((item): item is typeof item & { phone: string } => !!item.phone && config.recipients.has(item.phone))
    .map((item) => [item.phone, item] as const)).values());
  // The configured allowlist is capped at five even if a week contains hundreds of workers.
  const results = await Promise.allSettled(recipients.map((item) => sendTrialTemplate(item.phone, {
    name: item.name, start, end, details: formatTrialSchedule(start, end, item.rows),
  })));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
  const failed = results.length - sent;
  return {
    mode: "test", eligible: recipients.length, sent, failed,
    skipped: unique.size - recipients.length,
    note: config.approvedTemplate
      ? "أُرسلت تفاصيل الدوام بقالب الجدول المعتمد من Meta"
      : "رسالة Meta التجريبية لا تحتوي على تفاصيل الدوام؛ يلزم اعتماد قالب الجدول قبل إرسال الورديات الفعلية",
  };
}
