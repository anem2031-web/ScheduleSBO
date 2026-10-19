import { createAuditLog } from "../../shared/audit";
import * as repo from "./assignments.repository";
import * as schedRepo from "./schedules.repository";
import * as assignSvc from "./assignments.service";
import { approvedAbsenceForRange, permissionOverlapMinutes } from "../leaves/approved-absence";
import { approvedAttendanceForRange } from "../overtime/overtime.service";
import {
  excludesRequiredHours,
  summarizeWorkBudget,
  workerWeekBounds,
} from "../workers/work-budget";
import {
  ScheduleError,
  calculateShiftDuration,
  assertDateString,
  createShiftTemplate,
} from "./schedules.service";

/**
 * ============================================================================
 * Worker Card Service — بطاقة العامل مصدر الحقيقة
 * المرجع الملزم: doc/schedule/WORKER_CARD_SPEC.md
 * ============================================================================
 */

export interface DayInterval {
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface WorkerCardInput {
  workerId: number;
  requiredDailyHours: number;
  branch?: string | null;
  weeklyRestDay?: number | null; // 0=الأحد..6=السبت
  patternType: "single" | "split";
  p1Start: string;
  p1End: string;
  p2Start?: string | null;
  p2End?: string | null;
  /** استثناءات الأيام: { "5": {p1Start,p1End,p2Start?,p2End?} } */
  dayOverrides?: Record<
    string,
    { p1Start: string; p1End: string; p2Start?: string; p2End?: string }
  > | null;
}

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function assertTime(v: string, field: string) {
  if (!TIME_RE.test(v)) {
    throw new ScheduleError("BAD_REQUEST", `صيغة وقت غير صالحة في ${field}`);
  }
}

function validateIntervalPair(p1: DayInterval, p2?: DayInterval | null) {
  calculateShiftDuration(p1.start, p1.end); // يتحقق ويحسب
  if (p2) {
    calculateShiftDuration(p2.start, p2.end);
  }
}

// ---------------------------------------------------------------------------
// حفظ/قراءة البطاقة
// ---------------------------------------------------------------------------

export async function saveWorkerCard(
  input: WorkerCardInput & { savedBy: number },
) {
  if (input.requiredDailyHours <= 0 || input.requiredDailyHours > 24) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "الساعات اليومية المطلوبة يجب أن تكون بين 1 و24",
    );
  }
  if (
    input.weeklyRestDay !== undefined &&
    input.weeklyRestDay !== null &&
    (input.weeklyRestDay < 0 || input.weeklyRestDay > 6)
  ) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "يوم الراحة يجب أن يكون بين 0 (الأحد) و6 (السبت)",
    );
  }
  assertTime(input.p1Start, "p1Start");
  assertTime(input.p1End, "p1End");
  if (input.patternType === "split") {
    if (!input.p2Start || !input.p2End) {
      throw new ScheduleError(
        "BAD_REQUEST",
        "نمط الفترتين يتطلب أوقات الفترة الثانية",
      );
    }
    assertTime(input.p2Start, "p2Start");
    assertTime(input.p2End, "p2End");
  }
  validateIntervalPair(
    { start: input.p1Start, end: input.p1End },
    input.patternType === "split"
      ? { start: input.p2Start!, end: input.p2End! }
      : null,
  );
  if (input.dayOverrides) {
    for (const [day, ov] of Object.entries(input.dayOverrides)) {
      const d = Number(day);
      if (isNaN(d) || d < 0 || d > 6) {
        throw new ScheduleError(
          "BAD_REQUEST",
          `مفتاح يوم غير صالح في الاستثناءات: ${day}`,
        );
      }
      assertTime(ov.p1Start, `استثناء يوم ${day}`);
      assertTime(ov.p1End, `استثناء يوم ${day}`);
      validateIntervalPair(
        { start: ov.p1Start, end: ov.p1End },
        ov.p2Start && ov.p2End ? { start: ov.p2Start, end: ov.p2End } : null,
      );
    }
  }

  const worker = await repo.findWorkerById(input.workerId);
  if (!worker) {
    throw new ScheduleError("NOT_FOUND", `العامل #${input.workerId} غير موجود`);
  }

  const old = await repo.findWorkerScheduleSettings(input.workerId);
  await repo.upsertWorkerScheduleSettings(input.workerId, {
    requiredHoursPerDay: String(input.requiredDailyHours) as any,
    branch: input.branch ?? null,
    weeklyRestDay: input.weeklyRestDay ?? null,
    patternType: input.patternType,
    p1Start: input.p1Start,
    p1End: input.p1End,
    p2Start: input.patternType === "split" ? input.p2Start : null,
    p2End: input.patternType === "split" ? input.p2End : null,
    dayOverrides: input.dayOverrides ?? null,
  });

  await createAuditLog(
    "worker_card",
    input.workerId,
    old ? "update" : "create",
    input.savedBy,
    old
      ? {
          requiredHoursPerDay: old.requiredHoursPerDay,
          patternType: (old as any).patternType,
          weeklyRestDay: (old as any).weeklyRestDay,
        }
      : undefined,
    {
      requiredDailyHours: input.requiredDailyHours,
      patternType: input.patternType,
      weeklyRestDay: input.weeklyRestDay,
      branch: input.branch,
    },
  );

  return repo.findWorkerScheduleSettings(input.workerId);
}

export async function getWorkerCard(workerId: number) {
  const settings = await repo.findWorkerScheduleSettings(workerId);
  return settings ?? null;
}

// ---------------------------------------------------------------------------
// الإجازات
// ---------------------------------------------------------------------------

const LEAVE_TYPES: Record<
  string,
  { code: string; nameAr: string; nameEn: string }
> = {
  annual: {
    code: "ANNUAL_LEAVE",
    nameAr: "إجازة سنوية",
    nameEn: "Annual Leave",
  },
  sick: { code: "SICK_LEAVE", nameAr: "إجازة مرضية", nameEn: "Sick Leave" },
  emergency: {
    code: "EMERGENCY_LEAVE",
    nameAr: "إجازة طارئة",
    nameEn: "Emergency Leave",
  },
};

export async function addWorkerLeave(input: {
  workerId: number;
  leaveType: "annual" | "sick" | "emergency";
  fromDate: string;
  toDate: string;
  reason?: string;
  addedBy: number;
}) {
  assertDateString(input.fromDate, "fromDate");
  assertDateString(input.toDate, "toDate");
  if (input.toDate < input.fromDate) {
    throw new ScheduleError("BAD_REQUEST", "تاريخ نهاية الإجازة قبل بدايتها");
  }
  const worker = await repo.findWorkerById(input.workerId);
  if (!worker) {
    throw new ScheduleError("NOT_FOUND", `العامل #${input.workerId} غير موجود`);
  }
  const lt = LEAVE_TYPES[input.leaveType];
  const dayTypeId = await repo.ensureDayType(lt.code, lt.nameAr, lt.nameEn);

  // إدخال يوم-بيوم مع تخطي المكرر
  const existing = await repo.findWorkerCalendarInRange(
    input.workerId,
    input.fromDate,
    input.toDate,
  );
  const existingDates = new Set(
    existing.map((e) =>
      typeof e.date === "string" ? e.date : e.date.toISOString().slice(0, 10),
    ),
  );

  let added = 0;
  const cursor = new Date(input.fromDate + "T00:00:00Z");
  const end = new Date(input.toDate + "T00:00:00Z");
  while (cursor <= end) {
    const ds = cursor.toISOString().slice(0, 10);
    if (!existingDates.has(ds)) {
      await repo.insertWorkerCalendarEntry({
        workerId: input.workerId,
        date: new Date(ds + "T00:00:00Z"),
        dayTypeId,
        reason: input.reason ?? lt.nameAr,
        approvedBy: input.addedBy,
        approvedAt: new Date(),
      });
      added++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  await createAuditLog(
    "worker_leave",
    input.workerId,
    "create",
    input.addedBy,
    undefined,
    {
      leaveType: input.leaveType,
      fromDate: input.fromDate,
      toDate: input.toDate,
      days: added,
    },
  );
  return { added };
}

export async function listWorkerLeaves(
  workerId: number,
  fromDate: string,
  toDate: string,
) {
  const rows = await repo.findWorkerCalendarInRange(workerId, fromDate, toDate);
  return rows.filter((r) =>
    Object.values(LEAVE_TYPES).some((lt) => lt.code === r.dayTypeCode),
  );
}

export async function removeWorkerLeaveEntry(input: {
  entryId: number;
  removedBy: number;
  workerId: number;
}) {
  await repo.deleteWorkerCalendarEntry(input.entryId);
  await createAuditLog(
    "worker_leave",
    input.workerId,
    "delete",
    input.removedBy,
    {
      entryId: input.entryId,
    },
  );
  return { removed: true };
}

// ---------------------------------------------------------------------------
// خط الزمن (WORKER_CARD_SPEC §5)
// المطلوب = الساعات اليومية × أيام العمل الفعلية (بلا راحة أسبوعية وبلا إجازات)
// ---------------------------------------------------------------------------

function dateRangeStrings(from: Date, to: Date): string[] {
  const out: string[] = [];
  const c = new Date(from);
  while (c <= to) {
    out.push(c.toISOString().slice(0, 10));
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

export async function getWorkerTimeline(workerId: number, refDate: string) {
  assertDateString(refDate, "refDate");
  const settings = await repo.findWorkerScheduleSettings(workerId);
  const dailyMinutes = settings
    ? Math.round(Number(settings.requiredHoursPerDay) * 60)
    : 0;
  const restDay = (settings as any)?.weeklyRestDay ?? null;

  const ref = new Date(refDate + "T00:00:00Z");
  const { start: weekStart, end: weekEnd } = workerWeekBounds(refDate);
  const monthStart = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0),
  );

  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  // الإجازات ضمن الشهر (تغطي الأسبوع واليوم أيضًا)
  const calendar = await repo.findWorkerCalendarInRange(
    workerId,
    monthStartStr < weekStart.toISOString().slice(0, 10)
      ? monthStartStr
      : weekStart.toISOString().slice(0, 10),
    monthEndStr > weekEnd.toISOString().slice(0, 10)
      ? monthEndStr
      : weekEnd.toISOString().slice(0, 10),
  );
  const leaveDates = new Set(
    calendar
      .filter((e) => excludesRequiredHours(e.dayTypeCode))
      .map((e) =>
        typeof e.date === "string" ? e.date : e.date.toISOString().slice(0, 10),
      ),
  );

  const isWorkingDay = (ds: string) => {
    const dow = new Date(ds + "T00:00:00Z").getUTCDay();
    if (restDay !== null && restDay !== undefined && dow === restDay)
      return false;
    if (leaveDates.has(ds)) return false;
    return true;
  };

  // المجدول من التكليفات الفعالة
  const assignments = await repo.findActiveAssignmentsForWorker(
    workerId,
    monthStartStr < weekStart.toISOString().slice(0, 10)
      ? monthStartStr
      : weekStart.toISOString().slice(0, 10),
    monthEndStr > weekEnd.toISOString().slice(0, 10)
      ? monthEndStr
      : weekEnd.toISOString().slice(0, 10),
  );
  const byDate = new Map<string, number>();
  const breaksByDate = new Map<string, number>();
  const absences = await approvedAbsenceForRange(workerId, monthStartStr < weekStart.toISOString().slice(0, 10) ? monthStartStr : weekStart.toISOString().slice(0, 10), monthEndStr > weekEnd.toISOString().slice(0, 10) ? monthEndStr : weekEnd.toISOString().slice(0, 10));
  for (const a of assignments) {
    const ds =
      typeof a.workDate === "string"
        ? a.workDate
        : a.workDate.toISOString().slice(0, 10);
    const permissionMinutes = permissionOverlapMinutes(a.startTime, a.endTime, absences.permissions.filter((permission) => permission.workDate === ds));
    byDate.set(ds, (byDate.get(ds) ?? 0) + Math.max(0, a.plannedMinutes - permissionMinutes));
    breaksByDate.set(ds, (breaksByDate.get(ds) ?? 0) + a.breakMinutes);
  }
  // الفعلي من سجلات الحضور فقط، بما يشمل أطراف الأسبوع الواقعة خارج الشهر.
  const attendance = await repo.findAttendanceActualMinutes(
    workerId,
    monthStartStr < weekStart.toISOString().slice(0, 10)
      ? monthStartStr
      : weekStart.toISOString().slice(0, 10),
    monthEndStr > weekEnd.toISOString().slice(0, 10)
      ? monthEndStr
      : weekEnd.toISOString().slice(0, 10),
  );
  // Stored punches remain elapsed attendance; the work budget deducts the daily break once.
  attendance.forEach((minutes, ds) => attendance.set(ds, Math.max(0, minutes - Math.min(30, breaksByDate.get(ds) ?? 0))));
  const approvedByDate = await approvedAttendanceForRange(workerId, monthStartStr < weekStart.toISOString().slice(0, 10) ? monthStartStr : weekStart.toISOString().slice(0, 10), monthEndStr > weekEnd.toISOString().slice(0, 10) ? monthEndStr : weekEnd.toISOString().slice(0, 10));
  const dayDates = [refDate];
  const weekDates = dateRangeStrings(weekStart, weekEnd);
  const monthDates = dateRangeStrings(monthStart, monthEnd);

  const build = (dates: string[]) => {
    return summarizeWorkBudget({
      dates,
      dailyMinutes,
      isWorkingDay,
      scheduledByDate: byDate,
      actualByDate: attendance,
      excusedMinutesByDate: absences.excusedMinutesByDate,
      approvedByDate,
      refDate,
    });
  };

  return {
    hasCard: !!settings,
    dailyRequiredMinutes: dailyMinutes,
    day: build(dayDates),
    week: build(weekDates),
    month: build(monthDates),
    isRestDayToday:
      restDay !== null &&
      restDay !== undefined &&
      new Date(refDate + "T00:00:00Z").getUTCDay() === restDay,
    isOnLeaveToday: leaveDates.has(refDate),
    permissionsToday: absences.permissions.filter((permission) => permission.workDate === refDate),
    nonWorkingDayLabel:
      calendar.find(
        (entry) =>
          excludesRequiredHours(entry.dayTypeCode) &&
          (typeof entry.date === "string"
            ? String(entry.date).slice(0, 10)
            : entry.date.toISOString().slice(0, 10)) === refDate,
      )?.dayTypeNameAr ?? null,
  };
}

// ---------------------------------------------------------------------------
// الترحيل (WORKER_CARD_SPEC §8 — المرحلة أ بند 4)
// يبني تكليفات الفترة من بطاقات كل العمال النشطين عبر خدمة S3 بكل فحوصاتها
// ---------------------------------------------------------------------------

function templateCodeFor(interval: DayInterval): string {
  const clean = (t: string) => t.slice(0, 5).replace(":", "");
  return `T${clean(interval.start)}_${clean(interval.end)}`;
}

async function ensureTemplateFor(
  interval: DayInterval,
  createdBy: number,
  cache: Map<string, Awaited<ReturnType<typeof createShiftTemplate>>>,
) {
  const code = templateCodeFor(interval);
  const cached = cache.get(code);
  if (cached) return cached;

  const existing = await schedRepo.findShiftTemplateByCode(code);
  if (existing) {
    if (!existing.isActive) {
      throw new ScheduleError(
        "FORBIDDEN_STATE",
        `القالب ${code} معطل — فعّله أو عدّل وقت البطاقة`,
      );
    }
    cache.set(code, existing);
    return existing;
  }
  const label = `${interval.start.slice(0, 5)}-${interval.end.slice(0, 5)}`;
  const created = (await createShiftTemplate({
    code,
    nameAr: label,
    nameEn: label,
    startTime: interval.start,
    endTime: interval.end,
    createdBy,
  }))!;
  cache.set(code, created);
  return created;
}

export async function rolloutPeriodFromCards(input: {
  periodId: number;
  rolledBy: number;
}) {
  const period = await schedRepo.findPeriodById(input.periodId);
  if (!period) {
    throw new ScheduleError(
      "NOT_FOUND",
      `الفترة #${input.periodId} غير موجودة`,
    );
  }
  if (!["draft", "published"].includes(period.status)) {
    throw new ScheduleError(
      "FORBIDDEN_STATE",
      `لا يمكن الترحيل إلى فترة حالتها "${period.status}"`,
    );
  }

  const dstr = (v: Date | string) =>
    typeof v === "string" ? v : v.toISOString().slice(0, 10);
  const dates = dateRangeStrings(
    new Date(dstr(period.startDate) + "T00:00:00Z"),
    new Date(dstr(period.endDate) + "T00:00:00Z"),
  );

  const allSettings = await repo.listAllScheduleSettings();
  const activeWorkers = await repo.listActiveWorkers();
  const activeIds = new Set(activeWorkers.map((w) => w.id));

  const report = {
    workersProcessed: 0,
    workersWithoutCard: activeWorkers.length,
    created: 0,
    skipped: 0,
    details: [] as {
      workerId: number;
      date: string;
      status: string;
      reason?: string;
    }[],
  };

  // كل عامل مع بطاقة مكتملة + قائمة الفترات (interval) المطلوبة له في كل يوم
  type WorkerPlan = {
    workerId: number;
    st: any;
    overrides: Record<string, any>;
  };
  const workerPlans: WorkerPlan[] = [];
  for (const s of allSettings) {
    if (!activeIds.has(s.workerId)) continue;
    const st = s as any;
    if (!st.p1Start || !st.p1End) continue; // بطاقة غير مكتملة — لا ترحيل
    report.workersProcessed++;
    report.workersWithoutCard--;
    workerPlans.push({
      workerId: s.workerId,
      st,
      overrides: st.dayOverrides ?? {},
    });
  }

  const intervalsForDay = (plan: WorkerPlan, dow: number): DayInterval[] => {
    const ov = plan.overrides[String(dow)];
    if (ov?.p1Start && ov?.p1End) {
      const arr: DayInterval[] = [{ start: ov.p1Start, end: ov.p1End }];
      if (ov.p2Start && ov.p2End)
        arr.push({ start: ov.p2Start, end: ov.p2End });
      return arr;
    }
    const arr: DayInterval[] = [
      { start: plan.st.p1Start.slice(0, 5), end: plan.st.p1End.slice(0, 5) },
    ];
    if (plan.st.patternType === "split" && plan.st.p2Start && plan.st.p2End) {
      arr.push({
        start: plan.st.p2Start.slice(0, 5),
        end: plan.st.p2End.slice(0, 5),
      });
    }
    return arr;
  };

  // تمريرة أولى: نحدد كل قوالب الورديات المميزة المطلوبة عبر كل العمال والأيام،
  // ونضمن وجودها بالتسلسل (لتفادي إنشاء نفس القالب مرتين إذا عولجت مع تشغيل متوازٍ).
  const templateCache = new Map<
    string,
    Awaited<ReturnType<typeof createShiftTemplate>>
  >();
  const neededIntervals = new Map<string, DayInterval>();
  for (const plan of workerPlans) {
    for (const ds of dates) {
      const dow = new Date(ds + "T00:00:00Z").getUTCDay();
      if (
        plan.st.weeklyRestDay !== null &&
        plan.st.weeklyRestDay !== undefined &&
        dow === plan.st.weeklyRestDay
      ) {
        continue;
      }
      for (const interval of intervalsForDay(plan, dow)) {
        neededIntervals.set(templateCodeFor(interval), interval);
      }
    }
  }
  for (const interval of Array.from(neededIntervals.values())) {
    try {
      await ensureTemplateFor(interval, input.rolledBy, templateCache);
    } catch {
      // يُعاد اكتشاف نفس الخطأ (قالب معطل مثلًا) لاحقًا لكل تكليف يستخدمه،
      // فيُسجَّل بتفصيله الصحيح في report.details بدل إيقاف الترحيل كله هنا.
    }
  }

  // تمريرة ثانية: نعالج كل عامل بشكل مستقل ومتوازٍ — لا يوجد أي تداخل تعارض
  // بين عاملين مختلفين، فمعالجتهم بالتوازي آمنة تمامًا وتقلّل الوقت الكلي.
  const perWorkerResults = await Promise.all(
    workerPlans.map(async (plan) => {
      const created: string[] = [];
      const details: typeof report.details = [];
      let createdCount = 0;
      let skippedCount = 0;

      for (const ds of dates) {
        const dow = new Date(ds + "T00:00:00Z").getUTCDay();
        if (
          plan.st.weeklyRestDay !== null &&
          plan.st.weeklyRestDay !== undefined &&
          dow === plan.st.weeklyRestDay
        ) {
          details.push({ workerId: plan.workerId, date: ds, status: "rest" });
          continue;
        }

        for (const interval of intervalsForDay(plan, dow)) {
          try {
            const template = await ensureTemplateFor(
              interval,
              input.rolledBy,
              templateCache,
            );
            await assignSvc.createAssignment({
              periodId: input.periodId,
              workerId: plan.workerId,
              shiftTemplateId: template.id,
              supervisorId: input.rolledBy,
              workDate: ds,
              createdBy: input.rolledBy,
            });
            createdCount++;
          } catch (e) {
            skippedCount++;
            details.push({
              workerId: plan.workerId,
              date: ds,
              status: "skipped",
              reason: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      return { createdCount, skippedCount, details };
    }),
  );

  for (const r of perWorkerResults) {
    report.created += r.createdCount;
    report.skipped += r.skippedCount;
    report.details.push(...r.details);
  }

  await createAuditLog(
    "schedule_period",
    input.periodId,
    "update",
    input.rolledBy,
    undefined,
    {
      action: "rollout_from_cards",
      created: report.created,
      skipped: report.skipped,
      workersProcessed: report.workersProcessed,
    },
  );

  return report;
}
