import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";

/** English image layouts approved by the company. Text is supplied by Wardia. */
export type ScheduleImageDay = {
  day: string;
  date: string;
  /** One or two working periods, or a single day-off/leave label. */
  lines: readonly string[];
};

export type WeeklyScheduleImage = {
  workerName: string;
  days: readonly ScheduleImageDay[];
};

export type ScheduleUpdateImage = ScheduleImageDay & {
  workerName: string;
  changeType: string;
};

const require = createRequire(import.meta.url);
const fontRegular = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const fontBold = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function xml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
}

function clean(value: string, label: string, limit: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const result = value.trim().replace(/\s+/g, " ");
  if (!result || Array.from(result).length > limit || /[\u0000-\u001f\u007f]/.test(result)) throw new Error(`${label} is missing or too long`);
  return result;
}

/** Normalize a real Gregorian date; avoid silently displaying a wrong day. */
function dateInfo(value: string): { text: string; utc: number; day: number } {
  const text = clean(value, "date", 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!iso && !local) throw new Error("date must be YYYY-MM-DD or DD/MM/YYYY");
  const year = Number(iso ? iso[1] : local![3]);
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("invalid date");
  return { text: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`, utc: date.getTime(), day: date.getUTCDay() };
}

function checkedDay(item: ScheduleImageDay) {
  if (!item || !Array.isArray(item.lines) || item.lines.length < 1 || item.lines.length > 2) throw new Error("a day must contain one or two schedule lines");
  const d = dateInfo(item.date);
  const day = clean(item.day, "day", 12);
  if (day.toLowerCase() !== weekdayNames[d.day].toLowerCase()) throw new Error("day does not match date");
  return { day: weekdayNames[d.day].toUpperCase(), date: d.text, utc: d.utc, dow: d.day, lines: item.lines.map((s) => clean(s, "schedule line", 44)) };
}

function fit(value: string, max: number, min: number, width: number): number {
  // A conservative estimate in ems: wide capital letters need more space than
  // punctuation and spaces. This keeps ordinary shift times legible on phones.
  const units = Array.from(value).reduce((total, char) => total +
    (/\s/.test(char) ? 0.4 : /[MW@]/.test(char) ? 1 : /[A-Z]/.test(char) ? 0.8 :
      /[0-9]/.test(char) ? 0.72 : /[.:,\-/]/.test(char) ? 0.5 : 0.85), 0);
  return Math.max(min, Math.min(max, Math.floor(width / Math.max(1, units))));
}

function text(x: number, y: number, value: string, options: { size?: number; fill?: string; weight?: number; anchor?: "start" | "middle" | "end"; width?: number; min?: number } = {}) {
  const max = options.size ?? 24;
  const size = options.width ? fit(value, max, options.min ?? 16, options.width) : max;
  return `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${options.weight ?? 400}" fill="${options.fill ?? "#0d1b31"}" text-anchor="${options.anchor ?? "start"}">${xml(value)}</text>`;
}

function wrapName(name: string, maxLine = 30): string[] {
  const words = name.split(" ");
  const lines: string[] = [];
  for (const word of words) {
    const i = lines.length - 1;
    if (i >= 0 && Array.from(`${lines[i]} ${word}`).length <= maxLine) lines[i] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length > 2 || lines.some(line => Array.from(line).length > maxLine)) throw new Error("worker name is too long to fit the image");
  return lines;
}

function svgHeader(title: string, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}"><rect width="900" height="${height}" fill="#f4f7f2"/><rect x="22" y="22" width="856" height="${height - 44}" rx="28" fill="#fff" stroke="#d9e3d4" stroke-width="2"/>${title}`;
}

function footer(y: number) {
  return `<path d="M22 ${y + 70} Q450 ${y - 56} 878 ${y + 70} L878 ${y + 143} Q878 ${y + 168} 852 ${y + 168} L48 ${y + 168} Q22 ${y + 168} 22 ${y + 143}Z" fill="#e2f1d7"/><path d="M22 ${y + 70} Q450 ${y - 56} 878 ${y + 70}" fill="none" stroke="#c9a440" stroke-width="4"/>${text(450, y + 108, "SAM", { size: 54, weight: 700, anchor: "middle" })}${text(450, y + 140, "Scheduling & Attendance Management", { size: 21, anchor: "middle" })}`;
}

export function weeklyScheduleSvg(input: WeeklyScheduleImage): string {
  const name = clean(input.workerName, "worker name", 60);
  const nameLines = wrapName(name);
  if (!Array.isArray(input.days) || input.days.length !== 7) throw new Error("weekly schedule requires seven days");
  const days = input.days.map(checkedDay);
  if (days[0].dow !== 0 || days.some((day, index) => day.utc !== days[0].utc + index * 86400000)) throw new Error("weekly schedule must run Sunday through Saturday");
  const height = 1800, left = 50, top = 325, rowHeight = 158, col1 = 510, col2 = 660, right = 850;
  let content = svgHeader(text(450, 92, "WEEKLY WORK SCHEDULE", { size: 42, weight: 700, anchor: "middle", width: 800 }), height);
  content += `<path d="M80 120 H820" stroke="#c9a440" stroke-width="3"/>`;
  content += text(80, 174, "WORKER:", { size: 25, fill: "#a98529", weight: 700 });
  nameLines.forEach((line, i) => { content += text(245, 174 + i * 32, line, { size: 27, weight: 700, width: 570, min: 17 }); });
  content += text(80, 252, "DATES:", { size: 25, fill: "#a98529", weight: 700 });
  content += text(245, 252, `${days[0].date} - ${days[6].date}`, { size: 27, weight: 700 });
  content += `<rect x="${left}" y="${top}" width="800" height="72" rx="13" fill="#347c2b"/>`;
  content += text(280, top + 46, "WORK SCHEDULE", { size: 25, fill: "#fff", weight: 700, anchor: "middle" });
  content += text(585, top + 46, "DATE", { size: 25, fill: "#fff", weight: 700, anchor: "middle" });
  content += text(755, top + 46, "DAY", { size: 25, fill: "#fff", weight: 700, anchor: "middle" });
  days.forEach((d, i) => {
    const y = top + 72 + rowHeight * i;
    const isRest = /(?:DAY\s*OFF|LEAVE|VACATION|HOLIDAY)/i.test(d.lines[0]);
    content += `<rect x="${left}" y="${y}" width="${right - left}" height="${rowHeight}" fill="${isRest ? "#e9f5e2" : "#fff"}" stroke="#aac19e"/><path d="M${col1} ${y} V${y + rowHeight} M${col2} ${y} V${y + rowHeight}" stroke="#aac19e"/>`;
    d.lines.forEach((line, lineIndex) => {
      const lineY = y + (d.lines.length === 1 ? 87 : 65 + lineIndex * 45);
      content += text(75, lineY, line, { size: 24, weight: 700, width: 410, min: 9 });
    });
    content += text(585, y + 87, d.date.slice(0, 5), { size: 25, weight: 700, anchor: "middle" });
    content += text(755, y + 87, d.day, { size: 24, weight: 700, anchor: "middle", width: 170, min: 17 });
  });
  return content + footer(1610) + "</svg>";
}

export function scheduleUpdateSvg(input: ScheduleUpdateImage): string {
  const name = clean(input.workerName, "worker name", 60);
  const nameLines = wrapName(name);
  const day = checkedDay(input);
  const change = clean(input.changeType, "change type", 55);
  const height = 1070;
  let content = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}"><rect x="9" y="9" width="882" height="${height - 18}" rx="30" fill="#fff" stroke="#dc2626" stroke-width="4"/>`;
  content += text(450, 100, "SCHEDULE CHANGE", { size: 50, fill: "#bd2026", weight: 700, anchor: "middle", width: 800 });
  content += `<rect x="45" y="150" width="810" height="100" rx="25" fill="#e8f3e3"/>`;
  content += text(265, 213, day.day, { size: 38, weight: 700, anchor: "middle", width: 300 });
  content += `<path d="M450 175 V225" stroke="#4a9c42" stroke-width="3"/>`;
  content += text(665, 213, day.date, { size: 37, weight: 700, anchor: "middle", width: 340 });
  nameLines.forEach((line, i) => { content += text(450, 315 + i * 34, line, { size: 25, weight: 700, anchor: "middle", width: 740 }); });
  content += text(65, 408, change, { size: 29, width: 750, min: 17 });
  content += `<rect x="45" y="450" width="810" height="83" rx="22" fill="#e8f3e3"/>`;
  const isRest = /(?:DAY\s*OFF|LEAVE|VACATION|HOLIDAY)/i.test(day.lines[0]);
  content += text(450, 504, isRest ? "UPDATED SCHEDULE" : "UPDATED WORKING HOURS", { size: 31, weight: 700, anchor: "middle", width: 760 });
  day.lines.forEach((line, i) => {
    const y = 565 + i * 112;
    content += `<rect x="45" y="${y}" width="810" height="90" rx="18" fill="#fff" stroke="#55a747" stroke-width="2"/><path d="M235 ${y + 18} V${y + 72}" stroke="#55a747" stroke-width="3"/>`;
    const label = isRest ? "DAY STATUS" : day.lines.length === 1 ? "SCHEDULE" : `SHIFT ${i + 1}`;
    content += text(140, y + 56, label, { size: 24, weight: 700, anchor: "middle", width: 170, min: 18 });
    content += text(255, y + 56, line, { size: 26, weight: 700, width: 570, min: 12 });
  });
  content += text(450, 880, "For questions, contact your supervisor.", { size: 25, anchor: "middle", width: 800 });
  content += `<path d="M300 908 H600" stroke="#58a44c" stroke-width="2"/>`;
  content += text(450, 970, "SAM", { size: 52, weight: 700, anchor: "middle" });
  content += text(450, 1005, "Scheduling & Attendance Management", { size: 22, anchor: "middle" });
  return content + "</svg>";
}

function toPng(svg: string): Buffer {
  return Buffer.from(new Resvg(svg, { font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" } }).render().asPng());
}

export function renderWeeklySchedulePng(input: WeeklyScheduleImage): Buffer {
  return toPng(weeklyScheduleSvg(input));
}

export function renderScheduleUpdatePng(input: ScheduleUpdateImage): Buffer {
  return toPng(scheduleUpdateSvg(input));
}
