import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { dayTypes, requests, schedulePeriods, shiftAssignments, workerCalendar, workers, workerScheduleSettings } from "../../../drizzle/schema";
import { normalizeWorkerPhone } from "../../../shared/worker-phone";
import { addCalendarDays, isCalendarDate, sundayOf } from "../../../shared/weekly-schedule";
import { operationalClockMinutes } from "../../../shared/operational-day";
import { getDb } from "../../shared/db";

export type TrialSendReport = {
  mode: "disabled" | "waiting" | "test";
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
    // Only this exact opt-in enables the temporary hello_world publication test.
    // Missing/unknown modes retain schedule behavior and never fall back silently.
    connectionTest: process.env.WHATSAPP_TRIAL_DELIVERY_MODE === "connection_test",
    recipients: new Set(unique),
    phoneId: process.env.WHATSAPP_TRIAL_PHONE_NUMBER_ID?.trim() ?? "",
    token: process.env.WHATSAPP_TRIAL_ACCESS_TOKEN?.trim() ?? "",
    approvedTemplate: process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED === "true"
      ? process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME?.trim() ?? "" : "",
  };
}

export type WeeklyTemplateInput = {
  start: string;
  end: string;
  rows: Array<{ date: string; from: string; to: string }>;
  weeklyRestDay?: number | null;
  calendar?: Array<{ date: string; code: string; approved: boolean }>;
  leaves?: Array<{ start: string; end: string; kind: "annual" | "sick" }>;
};

const calendarLabels: Record<string, string> = {
  REST: "إجازة أسبوعية", REST_DAY: "إجازة أسبوعية", WEEKLY_REST: "إجازة أسبوعية",
  ANNUAL_LEAVE: "إجازة سنوية", SICK_LEAVE: "إجازة مرضية",
  HOLIDAY: "إجازة رسمية", PUBLIC_HOLIDAY: "إجازة رسمية",
  LEAVE: "إجازة معتمدة", EMERGENCY_LEAVE: "إجازة طارئة",
};

/** Exact contract for wardia_weekly_schedule: Sunday date/time through Saturday date/time. */
export function buildWeeklyTemplateValues(input: WeeklyTemplateInput): string[] {
  if (!isCalendarDate(input.start) || !isCalendarDate(input.end) || sundayOf(input.start) !== input.start || addCalendarDays(input.start, 6) !== input.end)
    throw new Error("قالب واتساب الأسبوعي يتطلب أسبوعًا كاملًا من الأحد إلى السبت");
  const values: string[] = [];
  for (let index = 0; index < 7; index++) {
    const date = addCalendarDays(input.start, index);
    const dayRows = input.rows.filter((row) => row.date === date)
      .sort((left, right) => operationalClockMinutes(left.from) - operationalClockMinutes(right.from));
    const leave = input.leaves?.find((item) => item.start <= date && item.end >= date);
    const calendar = input.calendar?.find((item) => item.date === date && item.approved && calendarLabels[item.code.toUpperCase()]);
    const absenceLabel = leave ? (leave.kind === "annual" ? "إجازة سنوية" : "إجازة مرضية")
      : calendar ? calendarLabels[calendar.code.toUpperCase()]
      : input.weeklyRestDay === index ? "إجازة أسبوعية" : undefined;
    if (absenceLabel && dayRows.length) throw new Error(`توجد فترات عمل متعارضة مع إجازة العامل بتاريخ ${date}`);
    const times = dayRows.map((row) => {
      // Validate both clocks and keep one single-line parameter for all of this day's periods.
      operationalClockMinutes(row.from);
      operationalClockMinutes(row.to);
      return `${row.from.slice(0, 5)} – ${row.to.slice(0, 5)}`;
    }).join("، ");
    values.push(`${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`, absenceLabel ?? (times || "لم يُحدد الدوام"));
  }
  return values;
}

export async function sendTrialTemplate(to: string, schedule?: string[]): Promise<boolean> {
  const config = trialConfig();
  if (!config.enabled || !config.phoneId || !config.token || !config.recipients.has(to)) return false;
  if (!/^\d{8,20}$/.test(config.phoneId)) throw new Error("معرّف رقم Meta التجريبي غير صالح");
  // A schedule must never fall back to the fixed hello_world connectivity probe.
  if (schedule && !config.approvedTemplate) return false;
  if (schedule && (schedule.length !== 14 || schedule.some((value) => !value.trim() || /[\r\n\t]/.test(value))))
    throw new Error("قالب الجدول يتطلب 14 قيمة نصية غير فارغة، كل قيمة في سطر واحد");
  const useScheduleTemplate = !!schedule;
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
          components: [{ type: "body", parameters: schedule!.map((text) => ({ type: "text", text })) }],
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

async function prepareTrialForPublishedPeriod(periodId: number) {
  const config = trialConfig();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [period] = await db.select({ startDate: schedulePeriods.startDate, endDate: schedulePeriods.endDate, status: schedulePeriods.status })
    .from(schedulePeriods).where(eq(schedulePeriods.id, periodId)).limit(1);
  if (!period) throw new Error("الأسبوع غير موجود");
  if (period.status !== "published") throw new Error("لا تُرسل التجربة قبل اعتماد الأسبوع");
  const dateKey = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const start = dateKey(period.startDate), end = dateKey(period.endDate);
  // Do not send a legacy partial/multi-week period through a fixed seven-day template.
  buildWeeklyTemplateValues({ start, end, rows: [] });
  const unique = new Map<number, { id: number; phone: string | null; name: string; rows: Array<{ date: string; from: string; to: string }> }>();
  // Leave-only and incomplete workers have no assignment row. Start with active pilot
  // workers so they can be previewed and approved leave can still produce a full week.
  const pilotWorkers = await db.select({ id: workers.id, phone: workers.phoneNumber, name: workers.nameAr })
    .from(workers).where(and(eq(workers.isActive, true), inArray(workers.status, ["active", "on_leave"])));
  for (const worker of pilotWorkers) {
    const phone = recipientNumber(worker.phone);
    if (phone && config.recipients.has(phone)) unique.set(worker.id, { id: worker.id, phone, name: worker.name, rows: [] });
  }
  const ids = Array.from(unique.keys());
  const [rows, settings, calendar, leaves] = ids.length ? await Promise.all([
    db.select({ workerId: shiftAssignments.workerId, workDate: shiftAssignments.workDate, startTime: shiftAssignments.startTime, endTime: shiftAssignments.endTime })
      .from(shiftAssignments).where(and(eq(shiftAssignments.periodId, periodId), inArray(shiftAssignments.workerId, ids), inArray(shiftAssignments.status, [...ACTIVE_ASSIGNMENTS]))),
    db.select({ workerId: workerScheduleSettings.workerId, weeklyRestDay: workerScheduleSettings.weeklyRestDay })
      .from(workerScheduleSettings).where(inArray(workerScheduleSettings.workerId, ids)),
    db.select({ workerId: workerCalendar.workerId, date: workerCalendar.date, code: dayTypes.code,
      approvedAt: workerCalendar.approvedAt, approvedBy: workerCalendar.approvedBy, requestId: workerCalendar.requestId, requestStatus: requests.status })
      .from(workerCalendar).innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId))
      .leftJoin(requests, eq(requests.id, workerCalendar.requestId))
      .where(and(inArray(workerCalendar.workerId, ids), gte(workerCalendar.date, new Date(`${start}T00:00:00Z`)), lte(workerCalendar.date, new Date(`${end}T00:00:00Z`)))),
    db.select({ workerId: requests.workerId, startDate: requests.startDate, endDate: requests.endDate, kind: requests.leaveKind })
      .from(requests).where(and(inArray(requests.workerId, ids), eq(requests.status, "approved"), inArray(requests.leaveKind, ["annual", "sick"]),
        lte(requests.startDate, new Date(`${end}T00:00:00Z`)), gte(requests.endDate, new Date(`${start}T00:00:00Z`)))),
  ]) : [[], [], [], []];
  for (const row of rows) unique.get(row.workerId)?.rows.push({ date: dateKey(row.workDate), from: row.startTime, to: row.endTime });
  const recipients = Array.from(unique.values())
    .filter((item): item is typeof item & { phone: string } => !!item.phone && config.recipients.has(item.phone));
  const messages = recipients.map((item) => {
    try {
      if (recipients.some((other) => other.id !== item.id && other.phone === item.phone))
        throw new Error("رقم الهاتف مرتبط بأكثر من عامل؛ صحح الربط قبل إرسال جدول شخصي");
      const values = buildWeeklyTemplateValues({
        start, end, rows: item.rows, weeklyRestDay: settings.find((setting) => setting.workerId === item.id)?.weeklyRestDay,
        calendar: calendar.filter((entry) => entry.workerId === item.id).map((entry) => ({ date: dateKey(entry.date), code: entry.code,
          approved: entry.requestId != null ? entry.requestStatus === "approved" : entry.approvedBy != null && entry.approvedAt != null })),
        leaves: leaves.filter((leave) => leave.workerId === item.id && leave.startDate && leave.endDate && (leave.kind === "annual" || leave.kind === "sick"))
          .map((leave) => ({ start: dateKey(leave.startDate!), end: dateKey(leave.endDate!), kind: leave.kind as "annual" | "sick" })),
      });
      const missingDays = values.filter((value, index) => index % 2 === 1 && value === "لم يُحدد الدوام").length;
      return { workerId: item.id, name: item.name, phone: item.phone, values,
        error: missingDays ? `الجدول غير مكتمل: لم يُحدد الدوام في ${missingDays} أيام؛ لا يُرسل حتى يكتمل` : null };
    } catch (error) {
      return { workerId: item.id, name: item.name, phone: item.phone, values: null, error: error instanceof Error ? error.message : "تعذر تجهيز جدول العامل" };
    }
  });
  return { messages, skipped: unique.size - recipients.length };
}

/** Read-only preview for the allowlisted workers; no access token or complete phone is returned. */
export async function previewTrialForPublishedPeriod(periodId: number) {
  const preview = await prepareTrialForPublishedPeriod(periodId);
  return {
    ...preview,
    messages: preview.messages.map(({ phone, ...message }) => ({ ...message, phoneEnding: phone.slice(-4) })),
  };
}

/** Only approved-period workers whose phone is explicitly allowlisted can receive a test message. */
export async function sendTrialForPublishedPeriod(periodId: number, actor?: { role: string; accessScope?: unknown }): Promise<TrialSendReport> {
  const config = trialConfig();
  const unavailable = !config.enabled || !config.phoneId || !config.token || !config.recipients.size;
  if (unavailable) return { mode: "disabled", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "إرسال واتساب التجريبي غير مفعّل" };
  if (actor && (actor.role === "supervisor" || actor.role === "worker" || (actor.role !== "admin" && actor.accessScope != null)))
    return { mode: "waiting", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "إرسال جداول التجربة المتعددة متاح لمسؤول بصلاحية تغطي جميع المراكز" };
  if (!config.connectionTest && !config.approvedTemplate) return { mode: "waiting", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "الجدول معتمد، وإرسال الورديات ينتظر اعتماد قالب Meta وضبطه. لم تُرسل رسالة الاختبار بدل الجدول." };
  const prepared = await prepareTrialForPublishedPeriod(periodId);
  // The configured allowlist is capped at five even if a week contains hundreds of workers.
  const results = await Promise.allSettled(prepared.messages.map(async (message) => {
    if (!message.values || message.error) throw new Error(message.error ?? "تعذر تجهيز جدول العامل");
    // In explicit connection-test mode, use only Meta's approved fixed template.
    // Worker names, dates and shifts are never attached to this request.
    return sendTrialTemplate(message.phone, config.connectionTest ? undefined : message.values);
  }));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
  const failed = results.length - sent;
  return {
    mode: "test", eligible: prepared.messages.length, sent, failed,
    skipped: prepared.skipped,
    note: config.connectionTest
      ? "اختبار اتصال فقط: أُرسلت طلبات قالب Meta التجريبي hello_world دون أسماء العمال أو تفاصيل جداولهم؛ هذه ليست رسائل الورديات. تأكيد التسليم يحتاج تحقق المستلم أو إشعار Meta."
      : "نتيجة قبول Meta لطلبات إرسال الجدول؛ تأكيد التسليم يحتاج إشعار Meta أو تحقق المستلم",
  };
}
