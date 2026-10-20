import { describe, expect, it, vi } from "vitest";
import {
  buildWeeklyExportRows,
  buildWeeklyRosterHtml,
  exportWeeklyPng,
  paginateWeeklyExportRows,
} from "../../../client/src/components/schedules/weekly-export";

type Payload = Parameters<typeof buildWeeklyRosterHtml>[0];
const fixture = () =>
  ({
    center: "مركز المطاعم",
    weekStart: "2026-10-18",
    dates: Array.from({ length: 7 }, (_, i) => `2026-10-${18 + i}`),
    workers: [
      {
        id: 1,
        name: "عامل ١",
        employeeId: "EMP-١",
        locationName: "مطعم ١",
        departmentName: "المطبخ",
        weeklyRestDay: 0,
        calendar: [],
      },
    ],
    assignments: [],
  }) as unknown as Payload;

describe("weekly print roster readability and escaping", () => {
  it("brands standalone print footers and titles with the selected export language", () => {
    const arabic = buildWeeklyRosterHtml({ ...fixture(), language: "ar" });
    const english = buildWeeklyRosterHtml({ ...fixture(), language: "en" });
    expect(arabic).toContain("وَرْدِيَة — نظام إدارة الدوام والحضور");
    expect(english).toContain("SAM — Scheduling &amp; Attendance Management");
    expect(english).not.toContain("وَرْدِيَة");
    expect(arabic).toContain("tfoot{display:table-footer-group}");
    expect(english).toContain('class="brand-footer" dir="ltr" lang="en"');
    expect(arabic).toContain("@font-face");
    expect(arabic).not.toMatch(/[٠-٩۰-۹]/);
  });
  it("isolates overnight time ranges from Arabic rest text", () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "15:30",
        endTime: "01:00",
        crossesMidnight: true,
        breakMinutes: 30,
      },
    ] as Payload["assignments"];
    const html = buildWeeklyRosterHtml(payload);
    expect(html).toContain('<bdi dir="ltr">15:30–01:00 (+1)</bdi>');
    expect(html).toContain('<small dir="rtl">راحة 30د</small>');
    expect(html).not.toContain('dir="auto"');
  });

  it("keeps split morning and evening intervals on separate ordered lines", () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "16:00",
        endTime: "20:30",
        breakMinutes: 30,
      },
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "05:00",
        endTime: "10:00",
        breakMinutes: 0,
      },
    ] as Payload["assignments"];
    const html = buildWeeklyRosterHtml(payload);
    expect(html).toContain(
      '<div class="period"><small class="phase">صباحًا</small><bdi dir="ltr">05:00–10:00</bdi></div>' +
        '<div class="period"><small class="phase">مساءً</small><bdi dir="ltr">16:00–20:30</bdi>',
    );
  });

  it("escapes names and calendar notes while retaining Western digits", () => {
    const payload = fixture();
    payload.workers[0].name = '<img src=x onerror="alert(١)">';
    payload.workers[0].calendar = [
      {
        date: "2026-10-19",
        label: 'إجازة <script>alert("٢")</script> / ملاحظة',
      },
    ] as Payload["workers"][number]["calendar"];
    const html = buildWeeklyRosterHtml(payload);
    expect(html).not.toMatch(/<img|<script|[٠-٩۰-۹]/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain(
      "إجازة &lt;script&gt;alert(&quot;2&quot;)&lt;/script&gt; / ملاحظة",
    );
    expect(html).toContain("A4 landscape");
  });

  it("labels the week Sunday through Saturday and preserves leave counters and rest", () => {
    const payload = fixture();
    payload.workers[0].calendar = [
      { date: "2026-10-19", label: "إجازة سنوية V27" },
    ] as Payload["workers"][number]["calendar"];
    const html = buildWeeklyRosterHtml(payload);
    expect(html).toContain(
      'الأحد <bdi dir="ltr">2026-10-18</bdi> إلى السبت <bdi dir="ltr">2026-10-24</bdi>',
    );
    expect(html).toContain('<th>الأحد<br><bdi dir="ltr">2026-10-18</bdi></th>');
    expect(html).toContain('<th>السبت<br><bdi dir="ltr">2026-10-24</bdi></th>');
    expect(html).toContain(
      'class="day-annual"><span class="day-label">إجازة سنوية V27',
    );
    expect(html).toContain(
      'class="day-rest"><span class="day-label">راحة أسبوعية',
    );
  });

  it("groups a shared worker under the actual period destination without duplicating periods", () => {
    const payload = fixture();
    payload.workers[0] = {
      ...payload.workers[0],
      costCenter: "الإدارة",
      costCenterId: 1,
      locationId: 1,
      locationName: "المكتب",
      departmentId: 1,
      departmentName: "الخدمات",
      jobTitleName: "بوفيه",
    } as Payload["workers"][number];
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "07:00",
        endTime: "14:00",
        costCenterId: 1,
        costCenter: "الإدارة",
        locationId: 1,
        locationName: "المكتب",
        departmentId: 1,
        departmentName: "الخدمات",
        jobTitleName: "بوفيه",
        supervisorName: "مشرف المكتب",
      },
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "19:00",
        endTime: "00:30",
        crossesMidnight: true,
        costCenterId: 2,
        costCenter: "المطاعم",
        locationId: 5,
        locationName: "كون زون",
        departmentId: 9,
        departmentName: "الكاشير",
        jobTitleName: "كاشير",
        supervisorName: "مدير المطاعم",
      },
    ] as Payload["assignments"];
    const rows = buildWeeklyExportRows(payload);
    expect(rows).toHaveLength(2);
    const office = rows.find((row) => row.groupLabel.includes("المكتب"))!;
    const restaurant = rows.find((row) => row.groupLabel.includes("كون زون"))!;
    expect(office.days[0].periods.map((period) => period.time)).toEqual([
      "07:00–14:00",
    ]);
    expect(restaurant.days[0].periods.map((period) => period.time)).toEqual([
      "19:00–00:30 (+1)",
    ]);
    expect(restaurant.days[0].periods[0].details).toEqual([
      "المهمة: كاشير",
      "المشرف: مدير المطاعم",
    ]);
    const html = buildWeeklyRosterHtml(payload);
    expect(html.match(/07:00–14:00/g)).toHaveLength(1);
    expect(html.match(/19:00–00:30/g)).toHaveLength(1);
    expect(html).toContain("المطاعم / كون زون / الكاشير");
  });

  it("orders post-midnight periods after evening and marks both next-date boundaries", () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "00:30",
        endTime: "02:00",
      },
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "19:00",
        endTime: "23:00",
      },
    ] as Payload["assignments"];
    const periods = buildWeeklyExportRows(payload)[0].days[0].periods;
    expect(periods.map((period) => period.time)).toEqual([
      "19:00–23:00",
      "00:30 (+1)–02:00 (+1)",
    ]);
    expect(periods[1].phase).toBe("بعد منتصف الليل");
  });

  it("escapes supervisor, destination and task fields at the final HTML boundary", () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "16:00",
        endTime: "20:00",
        locationName: "<img src=x>",
        departmentName: "<svg>",
        jobTitleName: "<script>١</script>",
        supervisorName: '" onmouseover="٢',
      },
    ] as Payload["assignments"];
    const html = buildWeeklyRosterHtml(payload);
    expect(html).not.toMatch(/<img|<script|<svg|[٠-٩۰-۹]/);
    expect(html).toContain("&lt;script&gt;1&lt;/script&gt;");
    expect(html).toContain("المشرف: &quot; onmouseover=&quot;2");
  });

  it("omits cancelled and outside-week periods", () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "05:00",
        endTime: "10:00",
        status: "cancelled",
      },
      {
        workerId: 1,
        workDate: "2026-10-25",
        startTime: "16:00",
        endTime: "20:00",
      },
    ] as Payload["assignments"];
    expect(
      buildWeeklyExportRows(payload)[0].days.flatMap((day) => day.periods),
    ).toEqual([]);
  });
});

describe("weekly PNG pagination", () => {
  it("measures detailed cells before drawing and keeps all text inside their rows", async () => {
    const payload = fixture();
    payload.assignments = [
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "05:00",
        endTime: "10:00",
        supervisorName: "مشرف الصيانة والأعمال الفنية في الموقع الرئيسي",
        jobTitleName: "عامل الصيانة والتجهيزات الفنية",
      },
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "16:00",
        endTime: "20:00",
        supervisorName: "مشرف الصيانة والأعمال الفنية في الموقع الرئيسي",
        jobTitleName: "عامل الصيانة والتجهيزات الفنية",
      },
      {
        workerId: 1,
        workDate: "2026-10-18",
        startTime: "22:00",
        endTime: "01:00",
        supervisorName: "مشرف الصيانة والأعمال الفنية في الموقع الرئيسي",
        jobTitleName: "عامل الصيانة والتجهيزات الفنية",
      },
    ] as Payload["assignments"];
    const drawn: Array<{ text: string; x: number; y: number }> = [];
    const rectangles: Array<{ y: number; height: number }> = [];
    const ctx = {
      measureText: (text: string) => ({ width: Array.from(text).length * 11 }),
      fillText: (text: string, x: number, y: number) =>
        drawn.push({ text, x, y }),
      strokeRect: (_x: number, y: number, _width: number, height: number) =>
        rectangles.push({ y, height }),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (callback: (value: Blob) => void) => callback(new Blob(["png"])),
    };
    const click = vi.fn();
    const anchor = { click, href: "", download: "" };
    vi.stubGlobal("document", {
      fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
      createElement: (tag: string) => (tag === "canvas" ? canvas : anchor),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:weekly-test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const partCount = await exportWeeklyPng(payload);
      expect(partCount).toBe(1);
      expect(click).toHaveBeenCalledOnce();
      expect(rectangles).toHaveLength(1);
      const row = rectangles[0];
      expect(row.height).toBeGreaterThan(135);
      const periodTexts = drawn.filter(
        (item) => item.x === 1788 && item.y >= row.y,
      );
      expect(periodTexts.some((item) => item.text === "05:00–10:00")).toBe(
        true,
      );
      expect(periodTexts.some((item) => item.text === "22:00–01:00 (+1)")).toBe(
        true,
      );
      expect(
        periodTexts.every(
          (item) => item.y > row.y && item.y < row.y + row.height,
        ),
      ).toBe(true);
      expect(drawn.every((item) => !/[٠-٩۰-۹]/.test(item.text))).toBe(true);
      expect(anchor.download).toContain("2026-10-18");
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("keeps every row once and repeats its group heading on each part", () => {
    const rows = Array.from({ length: 207 }, (_, id) => ({
      id,
      height: 200,
      headingHeight: 65,
      row: { groupKey: id < 100 ? "a" : "b" },
    }));
    const pages = paginateWeeklyExportRows(rows);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().map((row) => row.id)).toEqual(
      rows.map((row) => row.id),
    );
    for (const page of pages) {
      let group = "";
      const height = page.reduce((sum, row) => {
        const heading = group !== row.row.groupKey ? row.headingHeight : 0;
        group = row.row.groupKey;
        return sum + heading + row.height;
      }, 290);
      expect(height).toBeLessThanOrEqual(12_000);
    }
  });

  it("fails clearly for an individual unrenderable row instead of truncating its text", () => {
    expect(() =>
      paginateWeeklyExportRows([
        { height: 12_000, headingHeight: 65, row: { groupKey: "a" } },
      ]),
    ).toThrow("PDF");
    expect(paginateWeeklyExportRows([])).toEqual([[]]);
  });
});
