import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
import { auditLogs } from "../../../drizzle/schema";
import { claimScheduleDelivery, resolveScheduleDeliveryReview, saveScheduleDelivery, stageScheduleDelivery } from "./whatsapp-trial-state";

function fakeDatabase(initial?: Record<string, unknown>) {
  const state: { row: any; audits: any[] } = { row: initial ? { ...initial } : null, audits: [] };
  const tx: any = {
    insert(table: unknown) {
      return { values(value: any) {
        if (table === auditLogs) { state.audits.push(value); return Promise.resolve(); }
        return { onDuplicateKeyUpdate: async () => {
          state.row ??= { ...value, state: "idle", snapshot: null, pendingSnapshot: null, claimId: null, updatedAt: new Date() };
        } };
      } };
    },
    select() { return { from() { return { where() { return { for: async () => state.row ? [{ ...state.row }] : [] }; } }; } }; },
    update() { return { set(value: any) { return { where: async () => {
      if (!state.row) return [{ affectedRows: 0 }];
      Object.assign(state.row, value, { updatedAt: new Date() });
      return [{ affectedRows: 1 }];
    } }; } }; },
    transaction(fn: (db: any) => unknown) { return fn(tx); },
  };
  return { db: tx, state };
}

describe("pilot delivery state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims a worker, stages the message and records an accepted snapshot", async () => {
    const { db, state } = fakeDatabase(); mocks.getDb.mockResolvedValue(db);
    const { claimId, snapshot } = await claimScheduleDelivery(12, 3);
    expect(snapshot).toBeNull(); expect(state.row.state).toBe("sending");
    const values = Array(21).fill("value");
    await stageScheduleDelivery(12, 3, claimId, values);
    expect(state.row.pendingSnapshot).toEqual(values);
    await saveScheduleDelivery(12, 3, claimId, values, "idle");
    expect(state.row).toMatchObject({ state: "idle", claimId: null, snapshot: values, pendingSnapshot: null });
  });

  it("blocks claiming a message already being processed or needing review", async () => {
    for (const status of ["sending", "needs_review"]) {
      const { db } = fakeDatabase({ periodId: 12, workerId: 3, state: status, updatedAt: new Date() });
      mocks.getDb.mockResolvedValue(db);
      await expect(claimScheduleDelivery(12, 3)).rejects.toThrow("يحتاج مراجعة");
    }
  });

  it("keeps uncertain pending values and lets an admin record the verified outcome", async () => {
    const original = Array(21).fill("old"); const pending = Array(21).fill("new");
    const { db, state } = fakeDatabase({ periodId: 12, workerId: 3, state: "needs_review", snapshot: original, pendingSnapshot: pending, updatedAt: new Date() });
    mocks.getDb.mockResolvedValue(db);
    await resolveScheduleDeliveryReview({ periodId: 12, workerId: 3, actorId: 1, delivered: true, reason: "تأكدت من الاستلام" });
    expect(state.row).toMatchObject({ state: "idle", snapshot: pending, pendingSnapshot: null });
    expect(state.audits[0]).toMatchObject({ entityType: "whatsapp_trial_delivery", entityId: 3, performedBy: 1 });
  });

  it("does not resolve an active send or claim a missing pending message was delivered", async () => {
    const { db, state } = fakeDatabase({ periodId: 12, workerId: 3, state: "sending", updatedAt: new Date(), pendingSnapshot: null });
    mocks.getDb.mockResolvedValue(db);
    await expect(resolveScheduleDeliveryReview({ periodId: 12, workerId: 3, actorId: 1, delivered: false, reason: "تأكدت من عدم الوصول" })).rejects.toThrow("خمس دقائق");
    state.row.state = "needs_review";
    await expect(resolveScheduleDeliveryReview({ periodId: 12, workerId: 3, actorId: 1, delivered: true, reason: "تأكدت من الاستلام" })).rejects.toThrow("لا توجد رسالة محفوظة");
  });
});
