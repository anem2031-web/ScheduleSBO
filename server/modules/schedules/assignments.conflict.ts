import { ScheduleError } from "./schedules.service";
import { operationalClockMinutes } from "../../../shared/operational-day";

/**
 * ============================================================================
 * Conflict Engine (S3) — دوال نقية بلا قاعدة بيانات
 * ----------------------------------------------------------------------------
 * التمثيل الزمني: كل تكليف يُحوّل إلى مدى دقائق مطلق منذ Epoch يومي
 * (دقائق منذ منتصف ليل يوم العمل)، والوردية العابرة لمنتصف الليل تمتد
 * إلى ما بعد 1440. المقارنة بين يومين متتاليين تتم بإزاحة 1440 دقيقة.
 * ============================================================================
 */

export interface TimeInterval {
  /** بداية بالدقائق منذ منتصف ليل يوم العمل */
  startMin: number;
  /** نهاية بالدقائق — قد تتجاوز 1440 للعابرة لمنتصف الليل */
  endMin: number;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) {
    throw new ScheduleError("BAD_REQUEST", `وقت غير صالح: ${time}`);
  }
  return h * 60 + m;
}

/** مدى التكليف بالدقائق نسبةً ليوم عمله */
export function assignmentInterval(
  startTime: string,
  endTime: string,
  crossesMidnight: boolean,
): TimeInterval {
  const civilStart = toMinutes(startTime),
    civilEnd = toMinutes(endTime);
  const startMin = operationalClockMinutes(startTime);
  let endMin = startMin + (civilEnd - civilStart);
  if (crossesMidnight) {
    if (civilEnd >= civilStart) {
      throw new ScheduleError(
        "BAD_REQUEST",
        "وردية معلّمة كعابرة لمنتصف الليل لكن نهايتها بعد بدايتها",
      );
    }
    endMin += 1440;
  } else if (endMin <= startMin) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "نهاية الوردية يجب أن تكون بعد بدايتها (أو علّمها عابرة لمنتصف الليل)",
    );
  }
  return { startMin, endMin };
}

/** تداخل مدَيين على نفس المحور (حدود متلامسة لا تُعد تداخلًا) */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** فرق الأيام بين تاريخين yyyy-mm-dd */
export function dayDiff(fromDate: string, toDate: string): number {
  const a = new Date(fromDate + "T00:00:00Z").getTime();
  const b = new Date(toDate + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

export interface ExistingAssignment {
  id: number;
  workDate: string; // yyyy-mm-dd
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
}

/**
 * هل يتعارض التكليف الجديد زمنيًا مع تكليف قائم؟
 * يأخذ في الحسبان اختلاف الأيام: تكليف أمس العابر لمنتصف الليل
 * قد يتداخل مع تكليف اليوم الصباحي.
 */
export function conflictsWith(
  candidate: { workDate: string } & TimeInterval,
  existing: ExistingAssignment,
): boolean {
  const diff = dayDiff(candidate.workDate, existing.workDate);
  // تكليفان يبعدان يومين فأكثر لا يمكن أن يتداخلا (أقصى امتداد < 48 ساعة)
  if (Math.abs(diff) > 1) return false;
  const other = assignmentInterval(
    existing.startTime,
    existing.endTime,
    existing.crossesMidnight,
  );
  // إزاحة مدى القائم إلى محور يوم المرشح
  const shifted: TimeInterval = {
    startMin: other.startMin + diff * 1440,
    endMin: other.endMin + diff * 1440,
  };
  return intervalsOverlap(candidate, shifted);
}

/** أول تكليف قائم يتعارض مع المرشح، أو null */
export function findConflict(
  candidate: {
    workDate: string;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
  },
  existingList: ExistingAssignment[],
): ExistingAssignment | null {
  const interval = assignmentInterval(
    candidate.startTime,
    candidate.endTime,
    candidate.crossesMidnight,
  );
  for (const existing of existingList) {
    if (
      conflictsWith({ workDate: candidate.workDate, ...interval }, existing)
    ) {
      return existing;
    }
  }
  return null;
}

/**
 * مجموع الدقائق المخططة ليوم معين + المرشح — لفحص الحد اليومي.
 * الوردية تُنسب بالكامل ليوم بدايتها (قاعدة معتمدة).
 */
export function totalPlannedForDay(
  workDate: string,
  candidateMinutes: number,
  existingList: Pick<ExistingAssignment, "workDate">[] &
    { plannedMinutes?: number }[],
): number {
  let total = candidateMinutes;
  for (const e of existingList as Array<{
    workDate: string;
    plannedMinutes: number;
  }>) {
    if (e.workDate === workDate) total += e.plannedMinutes;
  }
  return total;
}
