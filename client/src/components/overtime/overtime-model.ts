import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { OPERATIONAL_DAY_START_MINUTES } from "@shared/operational-day";

export type OvertimeList = inferRouterOutputs<AppRouter>["overtime"]["list"];
export type OvertimeCenter = {
  id: number;
  nameAr: string;
  nameEn?: string | null;
};
export type OvertimeHistory = {
  id: number;
  stage: string;
  action: string;
  approved: boolean | null;
  actorName: string | null;
  reason: string | null;
  createdAt: Date | string;
};
export type OvertimeRow = {
  key: string;
  id: number | null;
  attendanceId: number | null;
  assignmentId: number | null;
  workerId: number;
  name: string;
  employeeId: string;
  workDate: string;
  kind: "planned" | "actual";
  minutes: number;
  extraStart: string | null;
  extraEnd: string | null;
  assignmentStart: string | null;
  assignmentEnd: string | null;
  costCenterId: number | null;
  costCenterName: string | null;
  supervisorName: string | null;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewedByName: string | null;
  reviewNote: string | null;
  status: "pending" | "approved" | "rejected";
  approvedByName: string | null;
  decisionNote: string | null;
  reopened: boolean;
  requiresApprovalReason: boolean;
  reason: string | null;
  canReview: boolean;
  canDecide: boolean;
  canReopen: boolean;
  canSubmit: boolean;
  history: OvertimeHistory[];
};
export type OvertimeFilter =
  | "all"
  | "actionable"
  | "supervisor"
  | "hr"
  | "approved"
  | "rejected"
  | "reopened";
export const OVERTIME_PAGE_SIZE = 32;
export const overtimeFilters: { value: OvertimeFilter; label: string }[] = [
  { value: "all", label: "جميع الحالات" },
  { value: "actionable", label: "تحتاج إجراء منك" },
  { value: "supervisor", label: "بانتظار المشرف" },
  { value: "hr", label: "بانتظار الشؤون الإدارية" },
  { value: "approved", label: "معتمد نهائيًا" },
  { value: "rejected", label: "مرفوض" },
  { value: "reopened", label: "أعيد فتحه للشؤون الإدارية" },
];

export function clock(minutes: number) {
  const local = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
}
export function clockLabel(value: string | null | undefined, isEnd = false) {
  if (!value) return "—";
  const time = value.slice(0, 5);
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return `${time}${minutes < OPERATIONAL_DAY_START_MINUTES || (isEnd && minutes === OPERATIONAL_DAY_START_MINUTES) ? " (+1)" : ""}`;
}
export function clockRange(start: string | null, end: string | null) {
  return `${clockLabel(start)} — ${clockLabel(end, true)}`;
}
export function periodLabel(start: string | null) {
  if (!start) return "فترة عمل";
  const minutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  return minutes >= OPERATIONAL_DAY_START_MINUTES && minutes < 12 * 60
    ? "صباحية"
    : "مسائية";
}
export function durationParts(minutes: number) {
  const whole = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}
export function durationLabel(minutes: number) {
  const parts = durationParts(minutes);
  return `${parts.hours} ساعة و${parts.minutes} دقيقة`;
}
export function dayLabel(workDate: string) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${workDate}T12:00:00Z`));
}
export function monthRange(day: string) {
  const month = day.slice(0, 7);
  return {
    fromDate: `${month}-01`,
    toDate: new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10),
  };
}
export function statusLabel(row: OvertimeRow) {
  if (row.status === "approved") return "معتمد نهائيًا";
  if (row.status === "rejected")
    return row.reviewStatus === "rejected"
      ? "رفض المشرف"
      : "رفض الشؤون الإدارية";
  if (row.reopened) return "بانتظار إعادة قرار الشؤون";
  return row.reviewStatus === "approved"
    ? "بانتظار الشؤون الإدارية"
    : "بانتظار المشرف";
}
export function rowNeedsAction(row: OvertimeRow) {
  return row.canReview || row.canDecide || row.canReopen || row.canSubmit;
}
export function overtimeNoteRequired(
  row: Pick<
    OvertimeRow,
    "canReopen" | "canSubmit" | "canReview" | "requiresApprovalReason"
  >,
  approved: boolean | null,
) {
  return (
    row.canReopen ||
    row.canSubmit ||
    row.canReview ||
    approved === false ||
    row.requiresApprovalReason
  );
}
export function overtimePage<T>(items: readonly T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / OVERTIME_PAGE_SIZE));
  const page = Math.max(
    1,
    Math.min(totalPages, Math.floor(requestedPage) || 1),
  );
  const offset = (page - 1) * OVERTIME_PAGE_SIZE;
  return {
    page,
    totalPages,
    items: items.slice(offset, offset + OVERTIME_PAGE_SIZE),
    from: items.length ? offset + 1 : 0,
    to: Math.min(offset + OVERTIME_PAGE_SIZE, items.length),
  };
}
export function rowMatchesFilter(row: OvertimeRow, status: OvertimeFilter) {
  if (status === "actionable") return rowNeedsAction(row);
  if (status === "supervisor")
    return row.status === "pending" && row.reviewStatus === "pending";
  if (status === "hr")
    return row.status === "pending" && row.reviewStatus === "approved";
  if (status === "reopened") return row.status === "pending" && row.reopened;
  return status === "all" || row.status === status;
}
export function overtimeRows(data: OvertimeList | undefined): OvertimeRow[] {
  if (!data) return [];
  const requests: OvertimeRow[] = data.items.map((item) => ({
    key: `request-${item.id}`,
    id: item.id,
    attendanceId: item.attendanceId,
    assignmentId: item.assignmentId,
    workerId: item.workerId,
    name: item.name,
    employeeId: item.employeeId,
    workDate: item.overtimeDate,
    kind: item.overtimeKind,
    minutes: item.totalMinutes,
    extraStart: item.requestedStartTime,
    extraEnd: item.requestedEndTime,
    assignmentStart: item.assignmentStartTime,
    assignmentEnd: item.assignmentEndTime,
    costCenterId: item.costCenterId,
    costCenterName: item.costCenterName,
    supervisorName: item.supervisorName,
    reviewStatus: item.reviewStatus,
    reviewedByName: item.reviewedByName,
    reviewNote: item.reviewNote,
    status: item.status === "paid" ? "approved" : item.status,
    approvedByName: item.approvedByName,
    decisionNote: item.decisionNote,
    reopened: item.reopened,
    requiresApprovalReason: item.requiresApprovalReason,
    reason: item.reasonText,
    canReview: item.canReview,
    canDecide: item.canDecide,
    canReopen: item.canReopen,
    canSubmit: false,
    history: item.history,
  }));
  const candidates: OvertimeRow[] = data.candidates.map((candidate) => ({
    key: `candidate-${candidate.attendanceId}-${candidate.assignmentId}`,
    id: null,
    attendanceId: candidate.attendanceId,
    assignmentId: candidate.assignmentId,
    workerId: candidate.workerId,
    name: candidate.name,
    employeeId: candidate.employeeId,
    workDate: candidate.workDate,
    kind: "actual",
    minutes: candidate.totalMinutes,
    extraStart: candidate.plannedEnd,
    extraEnd: clock(candidate.actualEnd),
    assignmentStart: candidate.assignmentStartTime,
    assignmentEnd: candidate.assignmentEndTime,
    costCenterId: candidate.costCenterId,
    costCenterName: candidate.costCenterName,
    supervisorName: candidate.supervisorName,
    reviewStatus: "pending",
    reviewedByName: null,
    reviewNote: null,
    status: "pending",
    approvedByName: null,
    decisionNote: null,
    reopened: false,
    requiresApprovalReason: false,
    reason: null,
    canReview: candidate.canCreate && candidate.canReview,
    canSubmit: candidate.canCreate && !candidate.canReview,
    canDecide: false,
    canReopen: false,
    history: [],
  }));
  return [...requests, ...candidates].sort(
    (a, b) => b.workDate.localeCompare(a.workDate) || (b.id ?? 0) - (a.id ?? 0),
  );
}
