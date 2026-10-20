import { WEEK_DAY_NAMES } from "@shared/weekly-schedule";
import { normalizeDigits } from "@shared/display-format";
import type { BoardAssignment, BoardWorker } from "./weekly-board-model";
import { productBrand, productSignature, BRAND_PRINT_COLOR } from "@shared/brand";
import { exportFontCss } from "./export-fonts";

type Destination = {
  costCenterId?: number | null;
  costCenter?: string;
  locationId?: number | null;
  locationName?: string;
  departmentId?: number | null;
  departmentName?: string;
  jobTitleId?: number | null;
  jobTitleName?: string;
  supervisorName?: string | null;
};
type ExportAssignment = BoardAssignment & Destination;
type ExportWorker = BoardWorker & Destination;
type ExportPayload = {
  /** Frozen at export time, independently of later UI language changes. */
  language?: string;
  center: string;
  weekStart: string;
  dates: string[];
  workers: ExportWorker[];
  /** The export endpoint supplies only periods belonging to the selected center. */
  assignments: ExportAssignment[];
};
type ExportPeriod = { time: string; phase: string; details: string[] };
type ExportDay = {
  kind: "work" | "annual" | "leave" | "rest" | "empty";
  label: string;
  periods: ExportPeriod[];
};
type ExportRow = {
  worker: ExportWorker;
  groupKey: string;
  groupLabel: string;
  days: ExportDay[];
};
const escape = (value: string) =>
  normalizeDigits(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const clockMinute = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const operationalMinute = (value: string) =>
  clockMinute(value) + (clockMinute(value) < 270 ? 1440 : 0);

function destinationFor(
  worker: ExportWorker,
  assignment?: ExportAssignment,
): Destination {
  return {
    costCenterId: assignment?.costCenterId ?? worker.costCenterId,
    costCenter: assignment?.costCenter ?? worker.costCenter,
    locationId: assignment?.locationId ?? worker.locationId,
    locationName: assignment?.locationName ?? worker.locationName,
    departmentId: assignment?.departmentId ?? worker.departmentId,
    departmentName: assignment?.departmentName ?? worker.departmentName,
  };
}
const destinationKey = (destination: Destination) =>
  JSON.stringify([
    destination.costCenterId ?? destination.costCenter,
    destination.locationId ?? destination.locationName,
    destination.departmentId ?? destination.departmentName,
  ]);
const destinationLabel = (destination: Destination) =>
  [destination.costCenter, destination.locationName, destination.departmentName]
    .filter(Boolean)
    .join(" / ") || "جهة العمل غير محددة";

function describePeriod(
  assignment: ExportAssignment,
  worker: ExportWorker,
): ExportPeriod {
  const start = clockMinute(assignment.startTime),
    end = clockMinute(assignment.endTime);
  const startNext = start < 270;
  const endNext =
    assignment.crossesMidnight ||
    end < start ||
    (startNext && end > start) ||
    end <= 270;
  const time = `${assignment.startTime}${startNext ? " (+1)" : ""}–${assignment.endTime}${endNext ? " (+1)" : ""}`;
  const task = assignment.jobTitleName ?? worker.jobTitleName;
  return {
    time,
    phase: startNext
      ? "بعد منتصف الليل"
      : start < 720
        ? "صباحًا"
        : start < 960
          ? "ظهرًا"
          : "مساءً",
    details: [
      task ? `المهمة: ${task}` : "",
      assignment.supervisorName ? `المشرف: ${assignment.supervisorName}` : "",
      assignment.breakMinutes ? `راحة ${assignment.breakMinutes}د` : "",
    ].filter(Boolean),
  };
}

/** One worker may appear under several actual destinations, with each period once. */
export function buildWeeklyExportRows({
  workers,
  assignments,
  dates,
}: ExportPayload): ExportRow[] {
  const byWorker = new Map<number, ExportAssignment[]>();
  for (const assignment of assignments) {
    if (
      !dates.includes(assignment.workDate) ||
      assignment.status === "cancelled"
    )
      continue;
    const bucket = byWorker.get(assignment.workerId);
    if (bucket) bucket.push(assignment);
    else byWorker.set(assignment.workerId, [assignment]);
  }
  const rows: ExportRow[] = [];
  for (const worker of workers) {
    const periods = byWorker.get(worker.id) ?? [];
    const groups = new Map<
      string,
      { destination: Destination; periods: ExportAssignment[] }
    >();
    for (const period of periods) {
      const destination = destinationFor(worker, period),
        key = destinationKey(destination);
      const existing = groups.get(key);
      if (existing) existing.periods.push(period);
      else groups.set(key, { destination, periods: [period] });
    }
    if (!groups.size) {
      const destination = destinationFor(worker);
      groups.set(destinationKey(destination), { destination, periods: [] });
    }
    for (const [key, group] of Array.from(groups)) {
      rows.push({
        worker,
        groupKey: key,
        groupLabel: destinationLabel(group.destination),
        days: dates.map((date): ExportDay => {
          const dayPeriods = group.periods
            .filter((period) => period.workDate === date)
            .sort(
              (a, b) =>
                operationalMinute(a.startTime) - operationalMinute(b.startTime),
            );
          if (dayPeriods.length)
            return {
              kind: "work",
              label: "",
              periods: dayPeriods.map((period) =>
                describePeriod(period, worker),
              ),
            };
          const calendar = worker.calendar.find((entry) => entry.date === date);
          if (calendar) {
            const kind =
              calendar.label.includes("سنوية") ||
              /\bV\d+\b/.test(calendar.label)
                ? "annual"
                : calendar.label.includes("راحة")
                  ? "rest"
                  : "leave";
            return { kind, label: calendar.label, periods: [] };
          }
          return new Date(`${date}T00:00:00Z`).getUTCDay() ===
            worker.weeklyRestDay
            ? { kind: "rest", label: "راحة أسبوعية", periods: [] }
            : { kind: "empty", label: "—", periods: [] };
        }),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.groupLabel.localeCompare(b.groupLabel, "ar") ||
      a.groupKey.localeCompare(b.groupKey) ||
      a.worker.name.localeCompare(b.worker.name, "ar") ||
      a.worker.id - b.worker.id,
  );
}

function renderHtmlDay(day: ExportDay) {
  if (!day.periods.length)
    return `<span class="day-label">${escape(day.label)}</span>`;
  return day.periods
    .map(
      (period) =>
        `<div class="period"><small class="phase">${escape(period.phase)}</small><bdi dir="ltr">${escape(period.time)}</bdi>${period.details.map((detail) => `<small dir="rtl">${escape(detail)}</small>`).join("")}</div>`,
    )
    .join("");
}

export function buildWeeklyRosterHtml(payload: ExportPayload) {
  const brand = productBrand(payload.language);
  const rows = buildWeeklyExportRows(payload);
  let group = "";
  const body = rows
    .map(({ worker, groupKey, groupLabel, days }) => {
      const heading =
        group !== groupKey
          ? `<tr class="group"><th colspan="8">${escape(groupLabel)}</th></tr>`
          : "";
      group = groupKey;
      return `${heading}<tr><td><b>${escape(worker.name)}</b><br><small>${escape(worker.employeeId)}</small></td>${days.map((day) => `<td class="day-${day.kind}">${renderHtmlDay(day)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(brand.name)} — جدول ${escape(payload.center)} ${escape(payload.weekStart)}</title><style>${exportFontCss()}@page{size:A4 landscape;margin:10mm}body{font-family:Cairo,Arial,sans-serif;color:#172033;font-size:10px}h1{font-size:20px;margin-bottom:6px}p{margin:5px 0 15px}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{border:1px solid #bcc7d5;padding:6px;text-align:center;line-height:1.7;overflow-wrap:anywhere}thead{display:table-header-group;background:#edf2f7}tr{break-inside:avoid}.period{padding:4px 0}.period+.period{border-top:1px dashed #bcc7d5}.period bdi{white-space:nowrap;font-size:11px;font-weight:bold}.period small{display:block}.phase{color:#475569}.group th{text-align:right;background:#e5edf9}.day-annual{background:#dcfce7}.day-leave{background:#e0f2fe}.day-rest{background:#fef9c3}.day-empty{color:#64748b}.brand-footer{padding-top:12px!important;border:0!important;color:${BRAND_PRINT_COLOR};font-family:${brand.font},Cairo,sans-serif;font-size:11px;font-weight:700;text-align:center}tfoot{display:table-footer-group}@media print{thead{display:table-header-group}}</style></head><body><h1>الجدول الأسبوعي — ${escape(payload.center)}</h1><p>الأحد <bdi dir="ltr">${escape(payload.weekStart)}</bdi> إلى السبت <bdi dir="ltr">${escape(payload.dates[6] ?? "")}</bdi> · الأوقات بتوقيت الرياض · (+1) اليوم التالي</p><table><thead><tr><th style="width:14%">العامل</th>${payload.dates.map((date, i) => `<th>${WEEK_DAY_NAMES[i]}<br><bdi dir="ltr">${escape(date)}</bdi></th>`).join("")}</tr></thead><tbody>${body || '<tr><td colspan="8">لا توجد بيانات لهذا المركز خلال الأسبوع</td></tr>'}</tbody><tfoot><tr><td colspan="8" class="brand-footer" dir="${brand.direction}" lang="${payload.language === "ar" || !payload.language ? "ar" : "en"}">${escape(productSignature(payload.language))}</td></tr></tfoot></table><p>ساعات مخططة · مركز تكلفة واحد · مرتب حسب جهة الفترة الفعلية ثم الموقع والقسم · V27 = اليوم 27 من الإجازة السنوية</p></body></html>`;
}

type TextLine = { text: string; direction: CanvasDirection; bold?: boolean };
type MeasuredRow = {
  row: ExportRow;
  names: TextLine[];
  days: TextLine[][];
  height: number;
  heading: TextLine[];
  headingHeight: number;
};
const PNG_WIDTH = 2200,
  PNG_MARGIN = 50,
  PNG_NAME_WIDTH = 350,
  PNG_COL_WIDTH = 250;
const PNG_LINE_HEIGHT = 29,
  PNG_HEADER_HEIGHT = 225,
  PNG_FOOTER_HEIGHT = 95,
  PNG_MAX_HEIGHT = 12_000;

/** Break long words too; drawing never squeezes or drops source text. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  value: string,
  width: number,
): string[] {
  const result: string[] = [];
  let line = "";
  for (const word of normalizeDigits(value).split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      line = candidate;
      continue;
    }
    if (line) result.push(line);
    line = "";
    for (const character of Array.from(word)) {
      if (line && ctx.measureText(line + character).width > width) {
        result.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line || !result.length) result.push(line);
  return result;
}

/** Testable pagination shared by all PNG exports; no row or heading is clipped. */
export function paginateWeeklyExportRows<
  T extends {
    height: number;
    headingHeight: number;
    row: { groupKey: string };
  },
>(
  rows: T[],
  maxHeight = PNG_MAX_HEIGHT,
  fixedHeight = PNG_HEADER_HEIGHT + PNG_FOOTER_HEIGHT,
): T[][] {
  const pages: T[][] = [];
  let page: T[] = [],
    used = fixedHeight,
    group = "";
  for (const row of rows) {
    if (row.height + row.headingHeight + fixedHeight > maxHeight)
      throw new Error(
        "تفاصيل أحد العمال أطول من الصورة المتاحة؛ استخدم تصدير PDF",
      );
    let heading = group !== row.row.groupKey ? row.headingHeight : 0;
    if (used + row.height + heading > maxHeight && page.length) {
      pages.push(page);
      page = [];
      used = fixedHeight;
      group = "";
      heading = row.headingHeight;
    }
    page.push(row);
    used += row.height + heading;
    group = row.row.groupKey;
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

export async function exportWeeklyPng(payload: ExportPayload) {
  const brand = productBrand(payload.language);
  await document.fonts.load(`700 20px ${brand.font}`, brand.name);
  await document.fonts.ready;
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر إنشاء صورة الجدول");
  ctx.font = "20px Cairo, Arial";
  const wrap = (
    text: string,
    width: number,
    bold = false,
    direction: CanvasDirection = "rtl",
  ): TextLine[] => {
    ctx.font = `${bold ? "bold " : ""}20px Cairo, Arial`;
    return wrapText(ctx, text, width).map((line) => ({
      text: line,
      bold,
      direction,
    }));
  };
  const measured: MeasuredRow[] = buildWeeklyExportRows(payload).map((row) => {
    const names = [
      ...wrap(row.worker.name, PNG_NAME_WIDTH - 28, true),
      ...wrap(row.worker.employeeId, PNG_NAME_WIDTH - 28, false, "ltr"),
    ];
    const days = row.days.map((day) =>
      day.periods.length
        ? day.periods.flatMap((period, i) => [
            ...(i ? [{ text: "", direction: "rtl" as const }] : []),
            ...wrap(period.phase, PNG_COL_WIDTH - 24),
            ...wrap(period.time, PNG_COL_WIDTH - 24, true, "ltr"),
            ...period.details.flatMap((detail) =>
              wrap(detail, PNG_COL_WIDTH - 24),
            ),
          ])
        : wrap(day.label, PNG_COL_WIDTH - 24),
    );
    const heading = wrap(row.groupLabel, PNG_WIDTH - PNG_MARGIN * 2 - 24, true);
    return {
      row,
      names,
      days,
      height: Math.max(
        110,
        (Math.max(names.length, ...days.map((lines) => lines.length)) + 1) *
          PNG_LINE_HEIGHT,
      ),
      heading,
      headingHeight: (heading.length + 1) * PNG_LINE_HEIGHT,
    };
  });
  const pages = paginateWeeklyExportRows(measured);
  for (const [pageIndex, page] of Array.from(pages.entries())) {
    let group = "";
    const contentHeight = page.reduce((height, item) => {
      const heading = item.row.groupKey !== group ? item.headingHeight : 0;
      group = item.row.groupKey;
      return height + item.height + heading;
    }, 0);
    canvas.width = PNG_WIDTH;
    canvas.height =
      PNG_HEADER_HEIGHT + Math.max(contentHeight, 80) + PNG_FOOTER_HEIGHT;
    const draw = (text: string, x: number, y: number) =>
      ctx.fillText(normalizeDigits(text), x, y);
    const drawLines = (lines: TextLine[], x: number, y: number) =>
      lines.forEach((line, index) => {
        ctx.direction = line.direction;
        ctx.font = `${line.bold ? "bold " : ""}20px Cairo, Arial`;
        draw(line.text, x, y + index * PNG_LINE_HEIGHT);
      });
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#172033";
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.font = "bold 32px Cairo, Arial";
    draw(`الجدول الأسبوعي — ${payload.center}`, PNG_WIDTH - PNG_MARGIN, 50);
    ctx.font = "21px Cairo, Arial";
    draw(
      `الأحد \u2066${payload.weekStart}\u2069 إلى السبت \u2066${payload.dates[6]}\u2069 · (+1) اليوم التالي · جزء ${pageIndex + 1}/${pages.length}`,
      PNG_WIDTH - PNG_MARGIN,
      90,
    );
    draw(
      "V27 = اليوم 27 من الإجازة السنوية · الأوقات بتوقيت الرياض",
      PNG_WIDTH - PNG_MARGIN,
      125,
    );
    let y = 145;
    ctx.fillStyle = "#e9eff8";
    ctx.fillRect(PNG_MARGIN, y, PNG_WIDTH - PNG_MARGIN * 2, 70);
    ctx.fillStyle = "#172033";
    ctx.font = "bold 22px Cairo, Arial";
    draw("العامل", PNG_WIDTH - PNG_MARGIN - 12, y + 42);
    payload.dates.forEach((date, i) => {
      const x =
        PNG_WIDTH - PNG_MARGIN - PNG_NAME_WIDTH - i * PNG_COL_WIDTH - 12;
      ctx.direction = "rtl";
      ctx.font = "bold 22px Cairo, Arial";
      draw(WEEK_DAY_NAMES[i], x, y + 28);
      ctx.direction = "ltr";
      ctx.font = "19px Arial";
      draw(date, x, y + 56);
    });
    y = PNG_HEADER_HEIGHT;
    group = "";
    for (const item of page) {
      if (group !== item.row.groupKey) {
        ctx.fillStyle = "#dce8f8";
        ctx.fillRect(
          PNG_MARGIN,
          y,
          PNG_WIDTH - PNG_MARGIN * 2,
          item.headingHeight,
        );
        ctx.fillStyle = "#172033";
        drawLines(
          item.heading,
          PNG_WIDTH - PNG_MARGIN - 12,
          y + PNG_LINE_HEIGHT,
        );
        y += item.headingHeight;
        group = item.row.groupKey;
      }
      item.row.days.forEach((day, i) => {
        const color = {
          annual: "#dcfce7",
          leave: "#e0f2fe",
          rest: "#fef9c3",
          empty: "#ffffff",
          work: "#ffffff",
        }[day.kind];
        const x =
          PNG_WIDTH - PNG_MARGIN - PNG_NAME_WIDTH - (i + 1) * PNG_COL_WIDTH;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, PNG_COL_WIDTH, item.height);
      });
      ctx.strokeStyle = "#bdc9d8";
      ctx.strokeRect(PNG_MARGIN, y, PNG_WIDTH - PNG_MARGIN * 2, item.height);
      ctx.fillStyle = "#172033";
      drawLines(item.names, PNG_WIDTH - PNG_MARGIN - 12, y + PNG_LINE_HEIGHT);
      item.days.forEach((lines, i) => {
        const x = PNG_WIDTH - PNG_MARGIN - PNG_NAME_WIDTH - i * PNG_COL_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + item.height);
        ctx.stroke();
        drawLines(lines, x - 12, y + PNG_LINE_HEIGHT);
      });
      y += item.height;
    }
    if (!page.length) {
      ctx.direction = "rtl";
      ctx.font = "22px Cairo, Arial";
      draw(
        "لا توجد بيانات لهذا المركز خلال الأسبوع",
        PNG_WIDTH - PNG_MARGIN,
        y + 40,
      );
    }
    ctx.direction = "rtl";
    ctx.font = "19px Cairo, Arial";
    ctx.fillStyle = "#475569";
    draw(
      `ساعات مخططة · ${pageIndex + 1}/${pages.length}`,
      PNG_WIDTH - PNG_MARGIN,
      canvas.height - 58,
    );
    ctx.direction = brand.direction;
    ctx.textAlign = "center";
    ctx.font = `bold 22px ${brand.font}, Cairo, Arial`;
    ctx.fillStyle = BRAND_PRINT_COLOR;
    draw(productSignature(payload.language), PNG_WIDTH / 2, canvas.height - 24);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("تعذر حفظ الصورة");
    const link = document.createElement("a"),
      url = URL.createObjectURL(blob);
    link.href = url;
    link.download = normalizeDigits(
      `${brand.name}-جدول-${payload.center}-${payload.weekStart}${pages.length > 1 ? `-جزء-${pageIndex + 1}` : ""}.png`,
    );
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return pages.length;
}
