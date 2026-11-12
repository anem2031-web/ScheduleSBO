import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, whatsappTrialScheduleState, workers } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

const key = (periodId: number, workerId: number) => and(
  eq(whatsappTrialScheduleState.periodId, periodId),
  eq(whatsappTrialScheduleState.workerId, workerId),
);

/** Persist a claim before an external request. An interrupted request must be reviewed. */
export async function claimScheduleDelivery(periodId: number, workerId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const claimId = randomUUID();
  return db.transaction(async (tx) => {
    await tx.insert(whatsappTrialScheduleState).values({ periodId, workerId })
      .onDuplicateKeyUpdate({ set: { periodId: sql`${whatsappTrialScheduleState.periodId}` } });
    const [row] = await tx.select().from(whatsappTrialScheduleState).where(key(periodId, workerId)).for("update");
    if (!row || row.state !== "idle") throw new Error("الإرسال السابق قيد المعالجة أو يحتاج مراجعة قبل إعادة المحاولة");
    await tx.update(whatsappTrialScheduleState).set({ state: "sending", claimId }).where(key(periodId, workerId));
    return { claimId, snapshot: row.snapshot };
  });
}

export async function stageScheduleDelivery(periodId: number, workerId: number, claimId: string, pendingSnapshot: string[]) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const result = await db.update(whatsappTrialScheduleState).set({ pendingSnapshot })
    .where(and(key(periodId, workerId), eq(whatsappTrialScheduleState.claimId, claimId), eq(whatsappTrialScheduleState.state, "sending")));
  const metadata = Array.isArray(result) ? result[0] : result;
  if (!(metadata && "affectedRows" in metadata && metadata.affectedRows === 1)) throw new Error("تعذر تجهيز حالة إرسال واتساب بأمان");
}

export async function saveScheduleDelivery(periodId: number, workerId: number, claimId: string, snapshot: string[] | null, state: "idle" | "sending" | "needs_review") {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const result = await db.update(whatsappTrialScheduleState).set({ snapshot, state, claimId: state === "sending" ? claimId : null, ...(state === "needs_review" ? {} : { pendingSnapshot: null }) })
    .where(and(key(periodId, workerId), eq(whatsappTrialScheduleState.claimId, claimId), eq(whatsappTrialScheduleState.state, "sending")));
  const metadata = Array.isArray(result) ? result[0] : result;
  if (!(metadata && "affectedRows" in metadata && metadata.affectedRows === 1)) throw new Error("تعذر حفظ حالة إرسال واتساب بأمان");
}

export async function listScheduleDeliveryReviews(periodId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  return db.select({ workerId: workers.id, name: workers.nameAr, state: whatsappTrialScheduleState.state,
    updatedAt: whatsappTrialScheduleState.updatedAt, snapshot: whatsappTrialScheduleState.snapshot,
    pendingSnapshot: whatsappTrialScheduleState.pendingSnapshot })
    .from(whatsappTrialScheduleState).innerJoin(workers, eq(workers.id, whatsappTrialScheduleState.workerId))
    .where(and(eq(whatsappTrialScheduleState.periodId, periodId), inArray(whatsappTrialScheduleState.state, ["sending", "needs_review"])));
}

/** Admin must inspect the recipient's WhatsApp before resolving an uncertain attempt. */
export async function resolveScheduleDeliveryReview(input: { periodId: number; workerId: number; actorId: number; delivered: boolean; reason: string }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(whatsappTrialScheduleState).where(key(input.periodId, input.workerId)).for("update");
    if (!row || row.state === "idle") throw new Error("لا يوجد إرسال ينتظر المراجعة");
    if (row.state === "sending" && Date.now() - new Date(row.updatedAt).getTime() < 5 * 60 * 1000)
      throw new Error("الإرسال ما زال قيد المعالجة؛ انتظر خمس دقائق قبل مراجعته");
    if (input.delivered && (!Array.isArray(row.pendingSnapshot) || row.pendingSnapshot.length !== 21))
      throw new Error("لا توجد رسالة محفوظة يمكن تأكيدها كمرسلة");
    await tx.update(whatsappTrialScheduleState).set({ snapshot: input.delivered ? row.pendingSnapshot : row.snapshot,
      pendingSnapshot: null, claimId: null, state: "idle" }).where(key(input.periodId, input.workerId));
    await tx.insert(auditLogs).values({ entityType: "whatsapp_trial_delivery", entityId: input.workerId, action: "update",
      performedBy: input.actorId, oldValues: { periodId: input.periodId, state: row.state },
      newValues: { delivered: input.delivered }, reason: input.reason });
    return { success: true };
  });
}
