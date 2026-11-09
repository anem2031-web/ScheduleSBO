import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../shared/db", () => ({ getDb: mocks.getDb }));
import { buildWeeklyTemplateValues, previewTrialForPublishedPeriod, sendTrialForPublishedPeriod, sendTrialProbe, sendTrialTemplate, trialConfig } from "./whatsapp-trial";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function configure() {
  vi.stubEnv("WHATSAPP_TRIAL_ENABLED", "true");
  vi.stubEnv("WHATSAPP_TRIAL_PHONE_NUMBER_ID", "123456789012345");
  vi.stubEnv("WHATSAPP_TRIAL_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_TRIAL_RECIPIENTS", "+966570344919,+966550931212,+966502202734");
  vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "false");
  vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME", "wardia_weekly_schedule");
  vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", "schedule");
}

describe("Meta test-number delivery guard", () => {
  it("requires an explicit connection_test mode and keeps unknown modes on schedule behavior", () => {
    configure();
    expect(trialConfig().connectionTest).toBe(false);
    vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", "");
    expect(trialConfig().connectionTest).toBe(false);
    vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", "test");
    expect(trialConfig().connectionTest).toBe(false);
    vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", "connection_test");
    expect(trialConfig().connectionTest).toBe(true);
  });
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
    const schedule = buildWeeklyTemplateValues({ start: "2026-11-08", end: "2026-11-14", rows: [], weeklyRestDay: 3 });
    expect(await sendTrialTemplate("966570344919", schedule)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "true");
    await sendTrialTemplate("966570344919", schedule);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template).toEqual({
      name: "wardia_weekly_schedule", language: { code: "ar" },
      components: [{ type: "body", parameters: schedule.map((text) => ({ type: "text", text })) }],
    });
  });

  it("automatic publication waits without any Meta call while template is unapproved", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendTrialForPublishedPeriod(1);
    expect(result.sent).toBe(0);
    expect(result.mode).toBe("waiting");
    expect(result.note).toContain("ينتظر اعتماد قالب Meta");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    await sendTrialProbe(0);
    // Manual probe still uses the fixed test template, independently of schedule approval.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template.name).toBe("hello_world");
  });

  it("previews a published worker's date/time slots without exposing a full phone or making any Meta request", async () => {
    configure();
    const results = [
      [{ startDate: "2026-11-08", endDate: "2026-11-14", status: "published" }],
      [{ id: 3, phone: "+966570344919", name: "عامل تجربة" }],
      [{ workerId: 3, workDate: "2026-11-08", startTime: "16:00:00", endTime: "01:00:00" }],
      [{ workerId: 3, weeklyRestDay: 3 }],
      [],
      [{ workerId: 3, startDate: "2026-11-09", endDate: "2026-11-10", kind: "annual" }],
    ];
    mocks.getDb.mockResolvedValue({ select: () => {
      const value = results.shift();
      const query: any = { from: () => query, where: () => query, limit: () => query, innerJoin: () => query, leftJoin: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
      return query;
    } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const preview = await previewTrialForPublishedPeriod(5);
    expect(preview.messages).toHaveLength(1);
    expect(preview.messages[0]).toMatchObject({ workerId: 3, phoneEnding: "4919" });
    expect(preview.messages[0].error).toContain("الجدول غير مكتمل");
    expect(preview.messages[0]).not.toHaveProperty("phone");
    expect(preview.messages[0].values?.slice(0, 8)).toEqual(["08/11/2026", "16:00 – 01:00", "09/11/2026", "إجازة سنوية", "10/11/2026", "إجازة سنوية", "11/11/2026", "إجازة أسبوعية"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes approved full-week leave workers without assignments", async () => {
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "true");
    const results: unknown[][] = [
      [{ startDate: "2026-11-08", endDate: "2026-11-14", status: "published" }],
      [{ id: 9, phone: "+966570344919", name: "عامل في إجازة" }],
      [], [{ workerId: 9, weeklyRestDay: null }], [],
      [{ workerId: 9, startDate: "2026-11-01", endDate: "2026-11-30", kind: "annual" }],
    ];
    mocks.getDb.mockResolvedValue({ select: () => {
      const value = results.shift();
      const query: any = { from: () => query, where: () => query, limit: () => query, innerJoin: () => query, leftJoin: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
      return query;
    } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const report = await sendTrialForPublishedPeriod(5, { role: "admin" });
    expect(report).toMatchObject({ sent: 1, eligible: 1, failed: 0 });
    const params = JSON.parse(fetchMock.mock.calls[0][1].body).template.components[0].parameters;
    expect(params).toHaveLength(14);
    expect(params.filter((_: unknown, index: number) => index % 2 === 1).every((p: { text: string }) => p.text === "إجازة سنوية")).toBe(true);
  });

  it("does not broaden automatic sending for supervisors or center-scoped approvers", async () => {
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const actor of [{ role: "supervisor", accessScope: null }, { role: "hr_admin", accessScope: { costCenterIds: [1] } }]) {
      expect((await sendTrialForPublishedPeriod(5, actor)).mode).toBe("waiting");
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["schedule", "connection_test"])("blocks an incomplete allowlisted worker in %s mode", async (mode) => {
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", mode);
    vi.stubEnv("WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED", "true");
    const results: unknown[][] = [
      [{ startDate: "2026-11-08", endDate: "2026-11-14", status: "published" }],
      [{ id: 9, phone: "+966570344919", name: "عامل غير مجدول" }],
      [], [{ workerId: 9, weeklyRestDay: 3 }], [], [],
    ];
    mocks.getDb.mockResolvedValue({ select: () => {
      const value = results.shift();
      const query: any = { from: () => query, where: () => query, limit: () => query, innerJoin: () => query, leftJoin: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
      return query;
    } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendTrialForPublishedPeriod(5, { role: "admin" })).toMatchObject({ eligible: 1, failed: 1, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connection-test publication can use hello_world before schedule approval without sending worker data or 14 variables", async () => {
    configure();
    vi.stubEnv("WHATSAPP_TRIAL_DELIVERY_MODE", "connection_test");
    const results: unknown[][] = [
      [{ startDate: "2026-11-08", endDate: "2026-11-14", status: "published" }],
      [{ id: 9, phone: "+966570344919", name: "عامل في إجازة" }],
      [], [{ workerId: 9, weeklyRestDay: null }], [],
      [{ workerId: 9, startDate: "2026-11-01", endDate: "2026-11-30", kind: "annual" }],
    ];
    mocks.getDb.mockResolvedValue({ select: () => {
      const value = results.shift();
      const query: any = { from: () => query, where: () => query, limit: () => query, innerJoin: () => query, leftJoin: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) };
      return query;
    } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(trialConfig().approvedTemplate).toBe("");
    const report = await sendTrialForPublishedPeriod(5, { role: "admin" });
    expect(report).toMatchObject({ mode: "test", sent: 1, failed: 0, eligible: 1 });
    expect(report.note).toContain("اختبار اتصال فقط");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.template).toEqual({ name: "hello_world", language: { code: "en_US" } });
    expect(payload.template).not.toHaveProperty("components");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("2026-11");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("عامل في إجازة");
  });
});

describe("weekly 14-variable contract", () => {
  it("maps every Sun–Sat date, sorts split shifts operationally, and distinguishes rest, leave and unplanned days", () => {
    const result = buildWeeklyTemplateValues({
      start: "2026-11-08", end: "2026-11-14", weeklyRestDay: 3,
      rows: [
        { date: "2026-11-08", from: "18:00:00", to: "22:30:00" },
        { date: "2026-11-08", from: "05:00:00", to: "10:00:00" },
        { date: "2026-11-12", from: "16:00:00", to: "01:00:00" },
      ],
      leaves: [{ start: "2026-11-09", end: "2026-11-10", kind: "annual" }],
      calendar: [{ date: "2026-11-13", code: "SICK_LEAVE", approved: true }],
    });
    expect(result).toEqual([
      "08/11/2026", "05:00 – 10:00، 18:00 – 22:30",
      "09/11/2026", "إجازة سنوية", "10/11/2026", "إجازة سنوية",
      "11/11/2026", "إجازة أسبوعية", "12/11/2026", "16:00 – 01:00",
      "13/11/2026", "إجازة مرضية", "14/11/2026", "لم يُحدد الدوام",
    ]);
    expect(result).toHaveLength(14);
    expect(result.every((value) => !/[\r\n\t]/.test(value))).toBe(true);
  });

  it("does not call an unapproved calendar absence a leave", () => {
    const result = buildWeeklyTemplateValues({ start: "2026-11-08", end: "2026-11-14", rows: [],
      calendar: [{ date: "2026-11-08", code: "ANNUAL_LEAVE", approved: false }] });
    expect(result[1]).toBe("لم يُحدد الدوام");
  });

  it("blocks incompatible weeks and conflicting work on approved leave", () => {
    expect(() => buildWeeklyTemplateValues({ start: "2026-11-09", end: "2026-11-15", rows: [] })).toThrow("الأحد إلى السبت");
    expect(() => buildWeeklyTemplateValues({ start: "2026-11-08", end: "2026-11-21", rows: [] })).toThrow("الأحد إلى السبت");
    expect(() => buildWeeklyTemplateValues({ start: "2026-11-08", end: "2026-11-14", rows: [{ date: "2026-11-08", from: "05:00", to: "10:00" }],
      leaves: [{ start: "2026-11-08", end: "2026-11-08", kind: "sick" }] })).toThrow("متعارضة");
  });
});
