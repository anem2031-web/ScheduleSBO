/** Public product identity. Keep technical package names and database identifiers separate. */
export function productBrand(language: string = "ar") {
  return language === "ar"
    ? { name: "وَرْدِيَة", description: "نظام إدارة الدوام والحضور", direction: "rtl" as const, font: "Cairo" }
    : { name: "SAM", description: "Scheduling & Attendance Management", direction: "ltr" as const, font: "Inter" };
}

export function productSignature(language: string = "ar") {
  const brand = productBrand(language);
  return `${brand.name} — ${brand.description}`;
}

export const BRAND_PRINT_COLOR = "#76571e";
