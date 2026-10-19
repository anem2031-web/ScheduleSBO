import { TRPCError } from "@trpc/server";

export type OvertimeDecisionState = {
  status: string; reviewStatus: string; approvedBy?: number | null;
};

/** Stored JSON columns have historically contained either a JSON object or encoded JSON. */
export function auditObject(value: unknown): Record<string, any> {
  if (typeof value === "string") {
    try { return auditObject(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function overtimeReason(value: string | undefined | null, required: boolean): string | null {
  const result = value?.trim() ?? "";
  if (required && result.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب سبب القرار في 3 أحرف على الأقل" });
  if (result.length > 2000) throw new TRPCError({ code: "BAD_REQUEST", message: "السبب طويل جدًا؛ الحد الأقصى 2000 حرف" });
  return result || null;
}

export function wasReopened(events: { newValues?: unknown }[]): boolean {
  return events.some((event) => auditObject(event.newValues).stage === "admin_reopen");
}

export function assertFinalDecision(state: OvertimeDecisionState) {
  if (state.status !== "pending" || state.reviewStatus !== "approved")
    throw new TRPCError({ code: "CONFLICT", message: "يجب قبول المشرف أولًا؛ أو أن الطلب تمت معالجته بالفعل" });
}

export function assertReopen(actor: { role: string }, state: OvertimeDecisionState) {
  if (actor.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "إعادة فتح الرفض النهائي متاحة للأدمن فقط" });
  if (state.status !== "rejected" || state.reviewStatus !== "approved" || state.approvedBy == null)
    throw new TRPCError({ code: "CONFLICT", message: "يمكن إعادة فتح رفض الشؤون الإدارية النهائي فقط" });
}

export function finalDecisionReason(approved: boolean, value: string | undefined, reopened: boolean) {
  return overtimeReason(value, !approved || reopened);
}

export type OvertimeDestination = { costCenterId: number | null; costCenterName: string };
export type OvertimePeriodSnapshot = {
  assignmentStartTime: string | null; assignmentEndTime: string | null;
  supervisorId: number | null; supervisorName: string | null;
};

/** The first persisted request snapshot wins; later changes to a worker/period never move its costs. */
export function overtimeSourceSnapshot(events: { newValues?: unknown }[]) {
  for (const event of events) {
    const payload = auditObject(event.newValues);
    if (payload.sourceSnapshot && typeof payload.sourceSnapshot === "object") {
      const source = payload.sourceSnapshot;
      if ((source.costCenterId == null || Number.isSafeInteger(source.costCenterId)) && typeof source.costCenterName === "string")
        return source as OvertimeDestination & OvertimePeriodSnapshot;
    }
  }
  return null;
}
