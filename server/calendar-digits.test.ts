import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { arSA } from "react-day-picker/locale";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import { Calendar } from "../client/src/components/ui/calendar";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
} from "../client/src/components/ui/chart";

const month = new Date(2026, 9, 18, 12);
const easternDigits = /[\u0660-\u0669\u06F0-\u06F9\u066B\u066C]/;

describe("calendar numbering policy", () => {
  it("keeps Arabic language and Western digits even if a caller requests Arabic numerals", () => {
    const html = renderToStaticMarkup(
      React.createElement(Calendar, {
        month,
        today: month,
        locale: arSA,
        numerals: "arab",
        showWeekNumber: true,
        mode: "single",
      }),
    );

    expect(html).not.toMatch(easternDigits);
    expect(html).toContain("2026");
    expect(html).toContain("أكتوبر");
    expect(html).toContain("اذهب إلى الشهر التالي");
    expect(html).toContain("اليوم");
  });

  it("normalizes caller day, caption, week and accessibility formatters", () => {
    const html = renderToStaticMarkup(
      React.createElement(Calendar, {
        month,
        today: month,
        locale: arSA,
        showWeekNumber: true,
        mode: "single",
        formatters: {
          formatCaption: () => "أكتوبر ٢٠٢٦",
          formatDay: (day) =>
            new Intl.NumberFormat("ar-SA").format(day.getDate()),
          formatWeekNumber: () => "٤٣",
        },
        labels: {
          labelDayButton: () => "الأحد، ١٨ أكتوبر ٢٠٢٦",
          labelGrid: () => "أكتوبر ۲۰۲۶",
          labelWeekNumber: () => "الأسبوع ٤٣",
        },
      }),
    );

    expect(html).not.toMatch(easternDigits);
    expect(html).toContain("أكتوبر 2026");
    expect(html).toContain("الأحد، 18 أكتوبر 2026");
    expect(html).toContain("الأسبوع 43");
  });

  it("normalizes month and year dropdown labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(Calendar, {
        month,
        today: month,
        locale: arSA,
        captionLayout: "dropdown",
        startMonth: new Date(2026, 0, 1),
        endMonth: new Date(2027, 11, 31),
        formatters: {
          formatYearDropdown: (year) =>
            new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(
              year.getFullYear(),
            ),
          formatMonthDropdown: () => "شهر ١٠",
        },
      }),
    );

    expect(html).not.toMatch(easternDigits);
    expect(html).toContain("شهر 10");
    expect(html).toContain(">2026</option>");
  });
});

describe("chart tooltip numbering policy", () => {
  it.each([0, 9.5, 1234.5])(
    "renders numeric tooltip %s with Western digits",
    (value) => {
      const html = renderToStaticMarkup(
        React.createElement(ChartContainer, {
          config: { hours: { label: "الساعات ١" } },
          children: React.createElement(ChartTooltipContent, {
            active: true,
            payload: [{ dataKey: "hours", name: "hours", value, payload: {} }],
          }),
        }),
      );

      expect(html).not.toMatch(easternDigits);
      expect(html).toContain(new Intl.NumberFormat("en-US").format(value));
      expect(html).toContain("الساعات 1");
    },
  );

  it("normalizes text returned by caller formatters", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChartContainer, {
        config: { hours: { label: "الساعات" } },
        children: React.createElement(ChartTooltipContent, {
          active: true,
          payload: [
            { dataKey: "hours", name: "hours", value: 9.5, payload: {} },
          ],
          formatter: () => "٩٫٥",
          labelFormatter: () => "القيمة ۲",
        }),
      }),
    );

    expect(html).not.toMatch(easternDigits);
    expect(html).toContain("9.5");
    expect(html).toContain("القيمة 2");
  });

  it("normalizes legend text without altering series keys", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChartContainer, {
        config: { hours١: { label: "الساعات ١" } },
        children: React.createElement(ChartLegendContent, {
          payload: [{ dataKey: "hours١", value: "hours١" }],
        }),
      }),
    );

    // Internal keys remain raw; the visible label uses Western digits.
    expect(html).toContain("الساعات 1");
    expect(html).not.toContain("الساعات ١");
  });
});
