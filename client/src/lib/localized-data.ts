/** Select an existing translation, falling back to the original until one is available. */
export function localizedName(
  item: { nameAr?: string | null; nameEn?: string | null; nameUr?: string | null },
  language: "ar" | "en" | "ur",
): string {
  const selected = language === "en" ? item.nameEn : language === "ur" ? item.nameUr : item.nameAr;
  return selected?.trim() || item.nameAr?.trim() || item.nameEn?.trim() || item.nameUr?.trim() || "";
}

export function localizedJobTitle(
  item: { titleAr?: string | null; titleEn?: string | null; titleUr?: string | null },
  language: "ar" | "en" | "ur",
): string {
  return localizedName({nameAr: item.titleAr, nameEn: item.titleEn, nameUr: item.titleUr}, language);
}
