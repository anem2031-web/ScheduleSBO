import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), send: vi.fn(), listReviews: vi.fn(), resolveReview: vi.fn() }));
vi.mock("./whatsapp-trial-state", () => ({ listScheduleDeliveryReviews: mocks.listReviews, resolveScheduleDeliveryReview: mocks.resolveReview }));
vi.mock("./whatsapp-trial", () => ({
  previewTrialForPublishedPeriod: mocks.preview,
  sendTrialForPublishedPeriod: mocks.send,
  sendTrialProbe: vi.fn(),
  trialConfig: vi.fn(),
}));
import { schedulesRouter } from "./schedules.router";

function caller(role: string, accessScope: unknown = null) {
  return schedulesRouter.createCaller({ user: { id: 123, role, permissions: ["schedule:approve"], accessScope }, req: {}, res: {} } as any);
}

describe("whole-period WhatsApp trial scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue({ skipped: 0, messages: [] });
  });

  it.each(["supervisor", "worker"])("rejects %s with custom approval and null cost-center scope before reading or sending", async (role) => {
    await expect(caller(role).getPublishedWhatsAppTrialPreview({ periodId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(role).sendPublishedWhatsAppTrial({ periodId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects an administrative approver restricted to cost centers", async () => {
    await expect(caller("hr_admin", { costCenterIds: [1] }).getPublishedWhatsAppTrialPreview({ periodId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("allows a global administrative approver to preview", async () => {
    await expect(caller("hr_admin").getPublishedWhatsAppTrialPreview({ periodId: 1 })).resolves.toEqual({ skipped: 0, messages: [] });
    expect(mocks.preview).toHaveBeenCalledWith(1);
  });

  it.each(["worker", "supervisor", "hr_admin"])("prevents %s from inspecting or resolving uncertain messages", async (role) => {
    await expect(caller(role).getWhatsAppTrialReviews({ periodId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(role).resolveWhatsAppTrialReview({ periodId: 1, workerId: 2, delivered: false, reason: "تحققت من عدم الوصول" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listReviews).not.toHaveBeenCalled(); expect(mocks.resolveReview).not.toHaveBeenCalled();
  });

  it("allows only the admin to resolve a reviewed message and records their identity", async () => {
    mocks.resolveReview.mockResolvedValue({ success: true });
    const input = { periodId: 1, workerId: 2, delivered: true, reason: "تم التأكد من وصول الرسالة" };
    await expect(caller("admin").resolveWhatsAppTrialReview(input)).resolves.toEqual({ success: true });
    expect(mocks.resolveReview).toHaveBeenCalledWith({ ...input, actorId: 123 });
  });
});
