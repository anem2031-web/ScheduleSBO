import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTrialSchedule, sendTrialProbe, sendTrialTemplate, trialConfig } from "./whatsapp-trial";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configure() {
  vi.stubEnv("WHATSAPP_TRIAL_ENABLED", "true");
  vi.stubEnv("WHATSAPP_TRIAL_PHONE_NUMBER_ID", "123456789012345");
  vi.stubEnv("WHATSAPP_TRIAL_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_TRIAL_RECIPIENTS", "+966570344919,+966550931212,+966502202734");
}

describe("Meta test-number delivery guard", () => {
  it("never calls Meta when disabled or recipient is outside the allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_ENABLED", "false");
    expect(await sendTrialTemplate("966570344919")).toBe(false);
    vi.stubEnv("WHATSAPP_TRIAL_ENABLED", "true");
    expect(await sendTrialTemplate("966500000000")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces Meta's five-recipient test limit", () => {
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_RECIPIENTS", "+966500000001,+966500000002,+966500000003,+966500000004,+966500000005,+966500000006");
    expect(() => trialConfig()).toThrow("خمسة مستلمين");
  });

  it("the manual probe cannot target a number outside the configured list", async () => {
    configure();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTrialProbe(3)).rejects.toThrow("المستلم غير متاح");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a schedule body only when an approved template is explicitly configured", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const schedule = { name: "عامل تجربة", start: "2026-11-08", end: "2026-11-14", details: "2026-11-08: 16:00–01:00" };
    await sendTrialTemplate("966570344919", schedule);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template).toMatchObject({ name: "hello_world" });
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "true");
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME", "wardia_weekly_schedule_ar");
    await sendTrialTemplate("966570344919", schedule);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).template).toMatchObject({
      name: "wardia_weekly_schedule_ar",
      components: [{ type: "body", parameters: [{ text: "عامل تجربة" }, { text: "2026-11-08" }, { text: "2026-11-14" }, { text: "2026-11-08: 16:00–01:00" }] }],
    });
  });

  it("shows every date and preserves shifts ending after midnight", () => {
    expect(formatTrialSchedule("2026-11-08", "2026-11-09", [
      { date: "2026-11-08", from: "16:00:00", to: "01:00:00" },
    ])).toBe("2026-11-08: 16:00–01:00\n2026-11-09: غير مجدول / Unscheduled");
  });
});
