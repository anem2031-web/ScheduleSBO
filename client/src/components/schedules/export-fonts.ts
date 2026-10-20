import cairoArabic400 from "@fontsource/cairo/files/cairo-arabic-400-normal.woff2?url";
import cairoArabic700 from "@fontsource/cairo/files/cairo-arabic-700-normal.woff2?url";
import cairoLatin400 from "@fontsource/cairo/files/cairo-latin-400-normal.woff2?url";
import cairoLatin700 from "@fontsource/cairo/files/cairo-latin-700-normal.woff2?url";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2?url";

/** The standalone print iframe must load the same local fonts as the app. */
export function exportFontCss() {
  const font = (family: string, weight: number, url: string, range = "") =>
    `@font-face{font-family:${family};font-style:normal;font-weight:${weight};font-display:swap;src:url("${url}") format("woff2");${range ? `unicode-range:${range};` : ""}}`;
  return [
    font("Cairo", 400, cairoArabic400, "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF"),
    font("Cairo", 700, cairoArabic700, "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF"),
    font("Cairo", 400, cairoLatin400, "U+0000-00FF,U+2000-206F"),
    font("Cairo", 700, cairoLatin700, "U+0000-00FF,U+2000-206F"),
    font("Inter", 400, inter400), font("Inter", 700, inter700),
  ].join("");
}
