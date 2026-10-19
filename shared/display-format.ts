/** All numeric presentation uses Western digits; persisted values remain untouched. */
export const DISPLAY_NUMBERING_SYSTEM = "latn" as const;
export type DisplayLocale = string | string[];

/** Also accepts pasted Urdu/Persian digits and Arabic numeric separators. */
export function normalizeDigits(value: string): string {
  return value.replace(
    /[\u0660-\u0669\u06f0-\u06f9\u066b\u066c]/g,
    (character) => {
      const point = character.charCodeAt(0);
      if (point >= 0x0660 && point <= 0x0669) return String(point - 0x0660);
      if (point >= 0x06f0 && point <= 0x06f9) return String(point - 0x06f0);
      return character === "\u066b" ? "." : ",";
    },
  );
}

export function displayLanguage(language: string): string {
  return new Intl.Locale(language, {
    numberingSystem: DISPLAY_NUMBERING_SYSTEM,
  }).toString();
}

/** Preserve language, units and grouping intent, with '.' decimals and ',' groups. */
export function formatNumber(
  value: number | bigint,
  options: Intl.NumberFormatOptions = {},
  locale: DisplayLocale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    ...options,
    numberingSystem: DISPLAY_NUMBERING_SYSTEM,
  })
    .formatToParts(value)
    .map((part) =>
      part.type === "decimal"
        ? "."
        : part.type === "group"
          ? ","
          : normalizeDigits(part.value),
    )
    .join("");
}

/** The caller's calendar, date fields and timezone are preserved. */
export function formatDateTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale: DisplayLocale = "en-GB",
): string {
  const date = value instanceof Date ? value : new Date(value);
  return normalizeDigits(
    new Intl.DateTimeFormat(locale, {
      ...options,
      numberingSystem: DISPLAY_NUMBERING_SYSTEM,
    }).format(date),
  );
}
