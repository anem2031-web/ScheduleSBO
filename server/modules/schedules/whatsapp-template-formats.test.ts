import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), save: vi.fn(), stage: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: vi.fn() }));
vi.mock("./whatsapp-trial-state", () => ({ claimScheduleDelivery: mocks.claim, saveScheduleDelivery: mocks.save, stageScheduleDelivery: mocks.stage }));
vi.mock('./whatsapp-delivery-tracking',()=>({beginDelivery:vi.fn().mockResolvedValue(1),acceptedDelivery:vi.fn().mockResolvedValue(undefined),failedDelivery:vi.fn().mockResolvedValue(undefined)}));
vi.mock("./whatsapp-images", () => ({ renderWeeklySchedulePng: vi.fn(() => Buffer.from("png")), renderScheduleUpdatePng: vi.fn(() => Buffer.from("png")) }));
import { buildWeeklyTemplateValues, deliverChangedSchedule, sendTrialTemplate, sendTrialUpdate } from "./whatsapp-trial";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const target = "966570344919";
const options = { language: "en" as const, format: "media" as const, workerName: "Ahmed Mohamed" };
function configure() {
  vi.stubEnv("WHATSAPP_TRIAL_ENABLED", "true"); vi.stubEnv("WHATSAPP_TRIAL_PHONE_NUMBER_ID", "123456789012345");
  vi.stubEnv("WHATSAPP_TRIAL_ACCESS_TOKEN", "test-token"); vi.stubEnv("WHATSAPP_TRIAL_RECIPIENTS", `+${target}`);
  vi.stubEnv("WHATSAPP_TRIAL_EN_TEMPLATES_APPROVED", "true");
}
function sample() {
  const rows = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(i + 8).padStart(2, "0")}`, from: "16:00", to: "01:00" }));
  return buildWeeklyTemplateValues({ start: "2026-11-08", end: "2026-11-14", rows });
}

describe("English schedule templates", () => {
  it("uploads a unique image and includes the approved 21 body parameters", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "123456" }) }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendTrialTemplate(target, sample(), options)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/media");
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.to).toBe(target);
    expect(payload.template.name).toBe("wardia_weekly_schedule_media_en");
    expect(payload.template.language.code).toBe("en");
    expect(payload.template.components[0]).toEqual({ type: "header", parameters: [{ type: "image", image: { id: "123456" } }] });
    expect(payload.template.components[1].parameters).toHaveLength(21);
    expect(payload.template.components[1].parameters[1].text).toContain("FROM 04:00 PM TO 01:00 AM");
  });
  it("sends only an image header for the short image template", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "123456" }) }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendTrialTemplate(target, sample(), { ...options, format: "image" });
    const template = JSON.parse(fetchMock.mock.calls[1][1].body).template;
    expect(template.name).toBe("wardia_weekly_schedule_image");
    expect(template.components).toHaveLength(1);
    expect(template.components[0].type).toBe("header");
  });
  it("sends only five translated parameters for a changed day in text mode", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock);
    await sendTrialUpdate(target, ["الثلاثاء", "10/11/2026", "تغيير حالة الدوام", "إجازة أسبوعية", "—"], { ...options, format: "text" });
    const template = JSON.parse(fetchMock.mock.calls[0][1].body).template;
    expect(template.name).toBe("wardia_schedule_update_en");
    expect(template.components[0].parameters.map((p: {text:string}) => p.text)).toEqual(["Tuesday", "10/11/2026", "Schedule status changed", "Weekly day off", "—"]);
  });
  it("sends a changed-day image with the five matching English values", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "555333" }) }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendTrialUpdate(target, ["الجمعة", "13/11/2026", "تغيير وقت الدوام", "الفترة 1: FROM 05:30 AM TO 10:30 AM", "الفترة 2: FROM 06:00 PM TO 10:30 PM"], options);
    const template = JSON.parse(fetchMock.mock.calls[1][1].body).template;
    expect(template.name).toBe("wardia_schedule_update_media_en");
    expect(template.components[0].parameters[0].image.id).toBe("555333");
    expect(template.components[1].parameters.map((p: {text:string}) => p.text)).toEqual(["Friday", "13/11/2026", "Working hours changed", "SHIFT 1: FROM 05:30 AM TO 10:30 AM", "SHIFT 2: FROM 06:00 PM TO 10:30 PM"]);
  });
  it("does not upload or send an unapproved English template", async () => {
    configure(); vi.stubEnv("WHATSAPP_TRIAL_EN_TEMPLATES_APPROVED", "false");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await sendTrialTemplate(target, sample(), options)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("resends an unchanged week only when explicitly requested", async () => {
    configure(); const current = sample();
    mocks.claim.mockResolvedValue({ claimId: "claim", snapshot: current });
    mocks.save.mockResolvedValue(undefined); mocks.stage.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock);
    expect(await deliverChangedSchedule(1, 2, target, current, { ...options, format: "text" })).toBe("unchanged");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await deliverChangedSchedule(1, 2, target, current, { ...options, format: "text" }, true)).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
