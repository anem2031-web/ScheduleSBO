export const WORKER_LANGUAGES = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English — الإنجليزية" },
  { code: "ur", label: "اردو — الأردية" },
  { code: "hi", label: "हिन्दी — الهندية" },
  { code: "bn", label: "বাংলা — البنغالية" },
  { code: "ne", label: "नेपाली — النيبالية" },
  { code: "fil", label: "Filipino — الفلبينية" },
] as const;
export function workerLanguageLabel(code: string | null | undefined) {
  return WORKER_LANGUAGES.find(language => language.code === code)?.label ?? code ?? "غير محددة";
}
