import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { dayTypes, requests, schedulePeriods, shiftAssignments, workerCalendar, workers, workerScheduleSettings } from "../../../drizzle/schema";
import { normalizeWorkerPhone } from "../../../shared/worker-phone";
import { addCalendarDays, isCalendarDate, sundayOf } from "../../../shared/weekly-schedule";
import { operationalClockMinutes } from "../../../shared/operational-day";
import { getDb } from "../../shared/db";
import { claimScheduleDelivery, saveScheduleDelivery, stageScheduleDelivery } from "./whatsapp-trial-state";
import { acceptedDelivery, beginDelivery, failedDelivery } from './whatsapp-delivery-tracking';
import { englishScheduleValues, englishUpdateValues, englishWeekdays, templateName, type ScheduleMessageFormat, type ScheduleMessageOptions } from "./whatsapp-template-formats";

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

class MetaTrialError extends Error {
  constructor(readonly status: number, readonly metaCode?: number, readonly metaSubcode?: number) {
    super(`تعذر إرسال طلب واتساب عبر Meta (HTTP ${status}${metaCode === undefined ? "" : `، Meta ${metaCode}`}${metaSubcode === undefined ? "" : `، فرعي ${metaSubcode}`})`);
  }
}

async function metaTrialError(response: Response): Promise<MetaTrialError> {
  // Error bodies may contain personal data or credentials. Keep only numeric codes.
  let metaCode: number | undefined;
  let metaSubcode: number | undefined;
  try {
    const body = await response.json() as { error?: { code?: unknown; error_subcode?: unknown } };
    if (typeof body?.error?.code === "number" && Number.isSafeInteger(body.error.code) && body.error.code >= 0) metaCode = body.error.code;
    if (typeof body?.error?.error_subcode === "number" && Number.isSafeInteger(body.error.error_subcode) && body.error.error_subcode >= 0) metaSubcode = body.error.error_subcode;
  } catch { /* A response without JSON still reports its HTTP status. */ }
  return new MetaTrialError(response.status, metaCode, metaSubcode);
}

function describeTrialFailure(error: unknown, dataError: boolean): string {
  if (error instanceof MetaTrialError) {
    return `HTTP ${error.status}${error.metaCode === undefined ? "" : `، Meta ${error.metaCode}`}${error.metaSubcode === undefined ? "" : `، فرعي ${error.metaSubcode}`}`;
  }
  if (dataError) return "بيانات الجدول تحتاج مراجعة";
  if (error instanceof Error && error.message === "الإرسال السابق قيد المعالجة أو يحتاج مراجعة قبل إعادة المحاولة") return "محاولة سابقة تحتاج مراجعة";
  if (error instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(error.name)) return "تعذر الاتصال أو انتهت المهلة";
  return "تعذرت معالجة الإرسال؛ راجع إعدادات النظام";
}

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
  const requestedEnglishFormat = process.env.WHATSAPP_TRIAL_EN_FORMAT;
  if (unique.length > 5) throw new Error("تجربة وردية تقتصر على خمسة مستلمين");
  return {
    enabled,
    autoSend: process.env.WHATSAPP_TRIAL_AUTO_SEND === "true",
    // Only this exact opt-in enables the temporary hello_world publication test.
    // Missing/unknown modes retain schedule behavior and never fall back silently.
    connectionTest: process.env.WHATSAPP_TRIAL_DELIVERY_MODE === "connection_test",
    recipients: new Set(unique),
    phoneId: process.env.WHATSAPP_TRIAL_PHONE_NUMBER_ID?.trim() ?? "",
    token: process.env.WHATSAPP_TRIAL_ACCESS_TOKEN?.trim() ?? "",
    approvedTemplate: process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED === "true" && process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_VARIABLES === "21"
      ? process.env.WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME?.trim() ?? "" : "",
    approvedUpdateTemplate: process.env.WHATSAPP_TRIAL_UPDATE_TEMPLATE_APPROVED === "true"
      ? process.env.WHATSAPP_TRIAL_UPDATE_TEMPLATE_NAME?.trim() ?? "" : "",
    enTemplatesApproved: process.env.WHATSAPP_TRIAL_EN_TEMPLATES_APPROVED === "true",
    englishFormat: (requestedEnglishFormat === "text" || requestedEnglishFormat === "image" ? requestedEnglishFormat : "media") as ScheduleMessageFormat,
  };
}

const defaultMessageOptions: ScheduleMessageOptions = { language: "ar", format: "text", workerName: "" };

async function uploadScheduleImage(phoneId: string, token: string, png: Buffer): Promise<string> {
  const data = new FormData();
  data.set("messaging_product", "whatsapp");
  data.set("type", "image/png");
  data.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "schedule.png");
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: data, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw await metaTrialError(response);
  const body = await response.json() as { id?: unknown };
  if (typeof body.id !== "string" || !/^\d+$/.test(body.id)) throw new Error("تعذر تجهيز صورة واتساب");
  return body.id;
}

async function englishTemplateComponents(kind: "weekly" | "update", format: ScheduleMessageFormat, values: string[], workerName: string, phoneId: string, token: string) {
  const localized = kind === "weekly" ? englishScheduleValues(values) : englishUpdateValues(values);
  const components: Array<Record<string, unknown>> = [];
  if (format !== "text") {
    const { renderWeeklySchedulePng, renderScheduleUpdatePng } = await import("./whatsapp-images");
    const png = kind === "weekly"
      ? await renderWeeklySchedulePng({ workerName, days: englishWeekdays.map((day, index) => ({ day, date: localized[index * 3], lines: localized.slice(index * 3 + 1, index * 3 + 3).filter(value => value !== "—") })) })
      : await renderScheduleUpdatePng({ workerName, day: localized[0], date: localized[1], changeType: localized[2], lines: localized.slice(3).filter(value => value !== "—") });
    const id = await uploadScheduleImage(phoneId, token, png);
    components.push({ type: "header", parameters: [{ type: "image", image: { id } }] });
  }
  if (format !== "image") components.push({ type: "body", parameters: localized.map(text => ({ type: "text", text })) });
  return components;
}

async function renderEnglishWeeklyPreview(values: string[], workerName: string): Promise<string> {
  const localized = englishScheduleValues(values);
  const { renderWeeklySchedulePng } = await import("./whatsapp-images");
  const image = await renderWeeklySchedulePng({ workerName, days: englishWeekdays.map((day, index) => ({
    day, date: localized[index * 3], lines: localized.slice(index * 3 + 1, index * 3 + 3).filter(value => value !== "—"),
  })) });
  return `data:image/png;base64,${image.toString("base64")}`;
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

function formatWhatsAppClock(time: string): string {
  operationalClockMinutes(time);
  const hour = Number(time.slice(0, 2));
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${time.slice(3, 5)} ${hour < 12 ? "AM" : "PM"}`;
}

/** Sunday to Saturday, each with date, first period/status, and optional second period. */
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
    if (dayRows.length > 2) throw new Error(`قالب واتساب يدعم فترتين فقط؛ راجع جدول العامل بتاريخ ${date}`);
    const times = dayRows.map((row, index) => {
      const period = `FROM ${formatWhatsAppClock(row.from)} TO ${formatWhatsAppClock(row.to)}`;
      return dayRows.length > 1 ? `الفترة ${index + 1}: ${period}` : period;
    });
    values.push(`${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`, absenceLabel ?? (times[0] || "لم يُحدد الدوام"), times[1] ?? "—");
  }
  return values;
}

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Produce updates for changed dates only, using the 21-value weekly contract. */
export function buildScheduleUpdates(previous: string[], current: string[]): string[][] {
  if (previous.length !== 21 || current.length !== 21) throw new Error("تتعذر مقارنة جدول غير مكتمل");
  const updates: string[][] = [];
  for (let day = 0; day < 7; day++) {
    const index = day * 3;
    const [date, first, second] = current.slice(index, index + 3);
    if (date !== previous[index]) throw new Error("لا يمكن مقارنة أسبوعين مختلفين");
    if (first === "لم يُحدد الدوام") throw new Error("الجدول غير مكتمل؛ لا يمكن إرسال التعديل");
    if (first === previous[index + 1] && second === previous[index + 2]) continue;
    const type = Object.values(calendarLabels).includes(first) ? "تغيير حالة الدوام" : "تغيير وقت الدوام";
    updates.push([ARABIC_WEEKDAYS[day], date, type, first, second]);
  }
  return updates;
}

async function readMetaMessageId(response: Response): Promise<string | null> {
  try { const data=await response.json() as {messages?: Array<{id?:unknown}>}; const id=data.messages?.[0]?.id; return typeof id==='string' && /^wamid\.[A-Za-z0-9_+=.\/\-]{1,240}$/.test(id) ? id : null; } catch { return null; }
}

export async function sendTrialUpdate(to: string, update: string[], options: ScheduleMessageOptions = defaultMessageOptions, onAccepted?: (messageId:string|null)=>Promise<void>, onAttempt?:()=>void): Promise<boolean> {
  const config = trialConfig();
  if (!config.enabled || !config.phoneId || !config.token || !config.recipients.has(to) || (options.language === "ar" ? !config.approvedUpdateTemplate : !config.enTemplatesApproved)) return false;
  if (!/^\d{8,20}$/.test(config.phoneId)) throw new Error("معرّف رقم واتساب غير صالح");
  if (update.length !== 5 || update.some((value) => !value.trim() || /[\r\n\t]/.test(value))) throw new Error("قالب التعديل يتطلب 5 قيم نصية غير فارغة");
  const body=JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: {
      name: options.language === "ar" ? config.approvedUpdateTemplate : templateName("update", options.format), language: { code: options.language },
      components: options.language === "ar" ? [{ type: "body", parameters: update.map((text) => ({ type: "text", text })) }]
        : await englishTemplateComponents("update", options.format, update, options.workerName, config.phoneId, config.token),
    } });
  onAttempt?.();
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw await metaTrialError(response);
  if (onAccepted) await onAccepted(await readMetaMessageId(response));
  return true;
}

async function trackedTemplateRequest(input:{periodId:number;workerId:number;phone:string;kind:'weekly'|'update';workDate?:string}, send:(onAccepted:(id:string|null)=>Promise<void>,onAttempt:()=>void)=>Promise<boolean>, onRequest:()=>void) {
  const id=await beginDelivery({periodId:input.periodId,workerId:input.workerId,kind:input.kind,workDate:input.workDate,phoneEnding:input.phone.slice(-4)});
  let accepted=false;
  try {
    const ok=await send(async(messageId)=>{
      accepted=true;
      // Meta already accepted it. Never retry a successful send merely because
      // recording its ID failed; the stale pending entry becomes unknown.
      try { await acceptedDelivery(id,messageId); }
      catch { console.error('WhatsApp delivery accepted but tracking could not be saved'); }
    },onRequest);
    if (!ok) throw new Error('الإرسال غير مفعّل');
  } catch(error) {
    // A timeout or a lost response is ambiguous; never report certain failure or resend.
    if (!accepted) try { await failedDelivery(id,error instanceof MetaTrialError && error.status>=400 && error.status<500,error instanceof MetaTrialError ? String(error.metaCode ?? error.status) : null); } catch { /* retain pending if persistence fails */ }
    throw error;
  }
}

/** Serialize a worker's pilot messages; uncertain delivery is never retried automatically. */
export async function deliverChangedSchedule(periodId: number, workerId: number, phone: string, current: string[], options: ScheduleMessageOptions = defaultMessageOptions, forceWeekly = false): Promise<"sent" | "unchanged"> {
  const config = trialConfig();
  const { claimId, snapshot: prior } = await claimScheduleDelivery(periodId, workerId);
  let snapshot = prior;
  let requested = false;
  try {
    if (!snapshot || forceWeekly) {
      if (options.language === "ar" ? !config.approvedTemplate : !config.enTemplatesApproved) throw new Error("قالب الجدول الأسبوعي غير معتمد أو غير مهيأ");
      await stageScheduleDelivery(periodId, workerId, claimId, current);
      await trackedTemplateRequest({periodId,workerId,phone,kind:'weekly'},(onAccepted,onAttempt)=>sendTrialTemplate(phone,current,options,onAccepted,onAttempt),()=>{requested=true});
      snapshot = [...current];
      await saveScheduleDelivery(periodId, workerId, claimId, snapshot, "idle");
      return "sent";
    }
    const updates = buildScheduleUpdates(snapshot, current);
    if (!updates.length) {
      await saveScheduleDelivery(periodId, workerId, claimId, snapshot, "idle");
      return "unchanged";
    }
    if (options.language === "ar" ? !config.approvedUpdateTemplate : !config.enTemplatesApproved) throw new Error("قالب تعديل الدوام غير معتمد أو غير مهيأ");
    for (const update of updates) {
      const day = ARABIC_WEEKDAYS.indexOf(update[0]);
      const next: string[] = [...(snapshot ?? [])];
      next.splice(day * 3, 3, ...current.slice(day * 3, day * 3 + 3));
      await stageScheduleDelivery(periodId, workerId, claimId, next);
      const workDate=`${update[1].slice(6,10)}-${update[1].slice(3,5)}-${update[1].slice(0,2)}`;
      await trackedTemplateRequest({periodId,workerId,phone,kind:'update',workDate},(onAccepted,onAttempt)=>sendTrialUpdate(phone,update,options,onAccepted,onAttempt),()=>{requested=true});
      snapshot = next;
      await saveScheduleDelivery(periodId, workerId, claimId, snapshot, "sending");
      requested = false;
    }
    await saveScheduleDelivery(periodId, workerId, claimId, snapshot, "idle");
    return "sent";
  } catch (error) {
    // Once a request is attempted, an error may mean Meta accepted it but its reply was lost.
    // Stop retries until a human verifies delivery; this avoids duplicate notifications.
    try { await saveScheduleDelivery(periodId, workerId, claimId, snapshot, requested ? "needs_review" : "idle"); } catch { /* A stuck claim is safer than an untracked resend. */ }
    throw error;
  }
}

export async function sendTrialTemplate(to: string, schedule?: string[], options: ScheduleMessageOptions = defaultMessageOptions, onAccepted?: (messageId:string|null)=>Promise<void>, onAttempt?:()=>void): Promise<boolean> {
  const config = trialConfig();
  if (!config.enabled || !config.phoneId || !config.token || !config.recipients.has(to)) return false;
  if (!/^\d{8,20}$/.test(config.phoneId)) throw new Error("معرّف رقم Meta التجريبي غير صالح");
  // A schedule must never fall back to the fixed hello_world connectivity probe.
  if (schedule && (options.language === "ar" ? !config.approvedTemplate : !config.enTemplatesApproved)) return false;
  if (schedule && (schedule.length !== 21 || schedule.some((value) => !value.trim() || /[\r\n\t]/.test(value))))
    throw new Error("قالب الجدول يتطلب 21 قيمة نصية غير فارغة، كل قيمة في سطر واحد");
  const useScheduleTemplate = !!schedule;
  const body=JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: useScheduleTemplate
        ? {
          name: options.language === "ar" ? config.approvedTemplate : templateName("weekly", options.format), language: { code: options.language },
          components: options.language === "ar" ? [{ type: "body", parameters: schedule!.map((text) => ({ type: "text", text })) }]
            : await englishTemplateComponents("weekly", options.format, schedule!, options.workerName, config.phoneId, config.token),
        }
        : { name: "hello_world", language: { code: "en_US" } },
    });
  onAttempt?.();
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw await metaTrialError(response);
  if (onAccepted) await onAccepted(await readMetaMessageId(response));
  return true;
}

/** Manual connectivity probe; sends only the fixed Meta test template, never worker data. */
export async function sendTrialProbe(recipientIndex: number): Promise<void> {
  const config = trialConfig();
  const target = Array.from(config.recipients)[recipientIndex];
  if (!config.enabled || !config.phoneId || !config.token || !target) throw new Error("إرسال واتساب التجريبي غير جاهز أو المستلم غير متاح");
  await sendTrialTemplate(target);
}

async function prepareTrialForPublishedPeriod(periodId: number, requestedFormat: ScheduleMessageFormat = "media") {
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
  const unique = new Map<number, { id: number; phone: string | null; name: string; nameEn: string | null; preferredLanguage: string; rows: Array<{ date: string; from: string; to: string }> }>();
  // Leave-only and incomplete workers have no assignment row. Start with active pilot
  // workers so they can be previewed and approved leave can still produce a full week.
  const pilotWorkers = await db.select({ id: workers.id, phone: workers.phoneNumber, name: workers.nameAr, nameEn: workers.nameEn, preferredLanguage: workers.preferredLanguage })
    .from(workers).where(and(eq(workers.isActive, true), inArray(workers.status, ["active", "on_leave"])));
  for (const worker of pilotWorkers) {
    const phone = recipientNumber(worker.phone);
    if (phone && config.recipients.has(phone)) unique.set(worker.id, { id: worker.id, phone, name: worker.name, nameEn: worker.nameEn ?? null, preferredLanguage: worker.preferredLanguage ?? "ar", rows: [] });
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
    const language: "ar" | "en" | null = item.preferredLanguage === "ar" ? "ar" : item.preferredLanguage === "en" ? "en" : null;
    const deliveryFormat = language === "ar" ? "text" as const : language === "en" ? requestedFormat : null;
    const configurationError = language === "en" && !config.enTemplatesApproved ? "القوالب الإنجليزية غير مفعلة في إعدادات واتساب"
      : language === "ar" && !config.approvedTemplate ? "قالب الجدول العربي غير مفعّل في إعدادات واتساب" : null;
    try {
      if (!language || !deliveryFormat) throw new Error("لا يوجد قالب معتمد للغة التواصل المحددة؛ اختر العربية أو الإنجليزية في بطاقة العامل");
      if (language === "en" && deliveryFormat !== "text" && !item.nameEn?.trim()) throw new Error("أدخل الاسم الإنجليزي للعامل قبل إرسال الصورة الإنجليزية");
      if (recipients.some((other) => other.id !== item.id && other.phone === item.phone))
        throw new Error("رقم الهاتف مرتبط بأكثر من عامل؛ صحح الربط قبل إرسال جدول شخصي");
      const values = buildWeeklyTemplateValues({
        start, end, rows: item.rows, weeklyRestDay: settings.find((setting) => setting.workerId === item.id)?.weeklyRestDay,
        calendar: calendar.filter((entry) => entry.workerId === item.id).map((entry) => ({ date: dateKey(entry.date), code: entry.code,
          approved: entry.requestId != null ? entry.requestStatus === "approved" : entry.approvedBy != null && entry.approvedAt != null })),
        leaves: leaves.filter((leave) => leave.workerId === item.id && leave.startDate && leave.endDate && (leave.kind === "annual" || leave.kind === "sick"))
          .map((leave) => ({ start: dateKey(leave.startDate!), end: dateKey(leave.endDate!), kind: leave.kind as "annual" | "sick" })),
      });
      const missingDays = values.filter((value, index) => index % 3 === 1 && value === "لم يُحدد الدوام").length;
      return { workerId: item.id, name: item.name, nameEn: item.nameEn, phone: item.phone, language, deliveryFormat, configurationError, values,
        error: missingDays ? `الجدول غير مكتمل: لم يُحدد الدوام في ${missingDays} أيام؛ لا يُرسل حتى يكتمل` : null };
    } catch (error) {
      return { workerId: item.id, name: item.name, nameEn: item.nameEn, phone: item.phone, language, deliveryFormat, configurationError, values: null, error: error instanceof Error ? error.message : "تعذر تجهيز جدول العامل" };
    }
  });
  return { messages, skipped: unique.size - recipients.length };
}

/** Read-only preview for the allowlisted workers; no access token or complete phone is returned. */
export async function previewTrialForPublishedPeriod(periodId: number, format: ScheduleMessageFormat = "media") {
  const preview = await prepareTrialForPublishedPeriod(periodId, format);
  return {
    ...preview,
    messages: await Promise.all(preview.messages.map(async ({ phone, ...message }) => {
      let imagePreview: string | null = null;
      let error = message.error;
      if (!error && message.language === "en" && message.deliveryFormat !== "text" && message.values) {
        try { imagePreview = await renderEnglishWeeklyPreview(message.values, message.nameEn!.trim()); }
        catch { error = "تعذر إنشاء معاينة صورة الجدول"; }
      }
      return { ...message, values: message.values && message.language === "en" ? englishScheduleValues(message.values) : message.values,
        imagePreview, error, phoneEnding: phone.slice(-4) };
    })),
  };
}

/** Only approved-period workers whose phone is explicitly allowlisted can receive a test message. */
export async function sendTrialForPublishedPeriod(periodId: number, actor?: { role: string; accessScope?: unknown }, format?: ScheduleMessageFormat, forceWeekly = false): Promise<TrialSendReport> {
  const config = trialConfig();
  const unavailable = !config.enabled || !config.phoneId || !config.token || !config.recipients.size;
  if (unavailable) return { mode: "disabled", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "إرسال واتساب التجريبي غير مفعّل" };
  if (actor && (actor.role === "supervisor" || actor.role === "worker" || (actor.role !== "admin" && actor.accessScope != null)))
    return { mode: "waiting", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "إرسال جداول التجربة المتعددة متاح لمسؤول بصلاحية تغطي جميع المراكز" };
  if (!config.connectionTest && !config.approvedTemplate && !config.enTemplatesApproved) return { mode: "waiting", eligible: 0, sent: 0, failed: 0, skipped: 0, note: "الجدول معتمد، وإرسال الورديات ينتظر اعتماد قالب Meta وضبطه. لم تُرسل رسالة الاختبار بدل الجدول." };
  const prepared = await prepareTrialForPublishedPeriod(periodId, format ?? config.englishFormat);
  // The configured allowlist is capped at five even if a week contains hundreds of workers.
  const results = await Promise.allSettled(prepared.messages.map(async (message) => {
    if (!message.values || message.error) throw new Error(message.error ?? "تعذر تجهيز جدول العامل");
    // In explicit connection-test mode, use only Meta's approved fixed template.
    // Worker names, dates and shifts are never attached to this request.
    if (config.connectionTest) {
      if (!await sendTrialTemplate(message.phone)) throw new Error("إرسال التجربة غير مفعّل لهذا العامل");
      return "sent" as const;
    }
    if (message.configurationError) throw new Error(message.configurationError);
    if (!message.language || !message.deliveryFormat) throw new Error("لغة القالب غير مدعومة");
    return deliverChangedSchedule(periodId, message.workerId, message.phone, message.values, { language: message.language, format: message.deliveryFormat, workerName: message.nameEn?.trim() || message.name }, forceWeekly);
  }));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value === "sent").length;
  const unchanged = results.filter((result) => result.status === "fulfilled" && result.value === "unchanged").length;
  const failed = results.filter((result) => result.status === "rejected").length;
  const diagnostics = results.flatMap((result, index) => result.status === "rejected"
    ? [`${prepared.messages[index].phone.slice(-4)}: ${describeTrialFailure(result.reason, !!prepared.messages[index].error)}`] : []);
  return {
    mode: "test", eligible: prepared.messages.length, sent, failed,
    skipped: prepared.skipped + unchanged,
    note: config.connectionTest
      ? "اختبار اتصال فقط: أُرسلت طلبات قالب Meta التجريبي hello_world دون أسماء العمال أو تفاصيل جداولهم؛ هذه ليست رسائل الورديات. تأكيد التسليم يحتاج تحقق المستلم أو إشعار Meta."
      : `نتيجة قبول Meta لطلبات إرسال الجدول؛ تأكيد التسليم يحتاج إشعار Meta أو تحقق المستلم${diagnostics.length ? `. تفاصيل الفشل (${diagnostics.join("؛ ")})` : ""}`,
  };
}
