import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { normalizeDigits } from "@shared/display-format";
import { useLanguage } from "@/lib/i18n";
import { localizedName } from "@/lib/localized-data";
import {
  clockRange,
  dayLabel,
  durationLabel,
  durationParts,
  statusLabel,
  periodLabel,
  type OvertimeCenter,
  type OvertimeRow,
} from "./overtime-model";

const heading =
  "border-l border-b px-3 py-3 text-start align-middle font-medium";
const cell = "border-l border-b px-3 py-3 align-middle";

export function OvertimeGrid({
  rows,
  centers,
  loading,
  onOpen,
}: {
  rows: OvertimeRow[];
  centers: OvertimeCenter[];
  loading: boolean;
  onOpen: (row: OvertimeRow) => void;
}) {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => language === "en" ? en : language === "ur" ? ur : ar;
  const stickyWorker = language === "en" ? "left-0" : "right-0";
  const stickyAction = language === "en" ? "sm:right-0" : "sm:left-0";
  return (
    <div
      className="overflow-hidden rounded-xl border bg-card"
      aria-busy={loading}
    >
      <div
        className="max-h-[70vh] overflow-auto"
        tabIndex={0}
        aria-label={text("جدول العمل الإضافي، مرّر لعرض الأعمدة والصفوف", "Overtime table, scroll for rows and columns", "اوور ٹائم جدول، قطاریں اور کالم دیکھنے کے لیے اسکرول کریں")}
      >
        <table
          className={`w-full min-w-[1150px] border-separate border-spacing-0 ${language === "en" ? "text-left" : "text-right"} text-xs`}
          aria-label={text("العمل الإضافي حسب العامل والفترة ومركز التكلفة", "Overtime by worker, shift and cost center", "ملازم، شفٹ اور لاگت مرکز کے لحاظ سے اوور ٹائم")}
        >
          <thead className="sticky top-0 z-20 bg-secondary">
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={`${heading} sticky ${stickyWorker} z-30 min-w-44 bg-secondary`}
              >
                {text("العامل", "Worker", "ملازم")}
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-28`}>
                {text("اليوم والتاريخ", "Day and date", "دن اور تاریخ")}
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                {text("الفترة الأصلية", "Original shift", "اصل شفٹ")}
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                {text("الزيادة", "Overtime", "اضافی وقت")}
              </th>
              {centers.map((center) => (
                <th
                  key={center.id}
                  scope="colgroup"
                  colSpan={2}
                  className={`${heading} text-center`}
                >
                  {normalizeDigits(localizedName(center, language))}
                </th>
              ))}
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                {text("قرار المشرف وسببه", "Supervisor decision and reason", "سپروائزر کا فیصلہ اور وجہ")}
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                {text("الشؤون الإدارية", "Administration", "انتظامیہ")}
              </th>
              <th
                scope="col"
                rowSpan={2}
                className={`${heading} z-30 min-w-32 border-r bg-secondary sm:sticky ${stickyAction}`}
              >
                {text("الإجراء", "Action", "کارروائی")}
              </th>
            </tr>
            <tr>
              {centers.map((center) => (
                <Fragment key={center.id}>
                  <th scope="col" className={`${heading} min-w-14 text-center`}>
                    {text("ساعة", "Hours", "گھنٹے")}
                  </th>
                  <th scope="col" className={`${heading} min-w-14 text-center`}>
                    {text("دقيقة", "Minutes", "منٹ")}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((row) => {
                const duration = durationParts(row.minutes);
                return (
                  <tr
                    key={row.key}
                    data-testid={`overtime-${row.key}`}
                    className="group hover:bg-muted/20"
                  >
                    <td
                      className={`${cell} sticky ${stickyWorker} z-10 bg-card group-hover:bg-secondary`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        className="text-start text-sm font-semibold text-primary hover:underline"
                      >
                        {normalizeDigits(row.name)}
                      </button>
                      <div className="mt-1 text-muted-foreground">
                        <bdi>{normalizeDigits(row.employeeId)}</bdi>
                        {row.id && <> · #{row.id}</>}
                      </div>
                    </td>
                    <td className={cell}>
                      {dayLabel(row.workDate, language)}
                      <div className="mt-1 text-muted-foreground">
                        <bdi>{row.workDate}</bdi>
                      </div>
                    </td>
                    <td className={cell}>
                      <p className="mb-1 font-medium">
                        {periodLabel(row.assignmentStart, language)}
                      </p>
                      <bdi className="whitespace-nowrap tabular-nums">
                        {clockRange(row.assignmentStart, row.assignmentEnd)}
                      </bdi>
                      <div className="mt-1 text-muted-foreground">
                        {normalizeDigits(row.costCenterName ?? text("مركز غير محدد", "Unspecified cost center", "لاگت مرکز متعین نہیں"))}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {normalizeDigits(row.supervisorName ?? text("مشرف غير مسجل", "Supervisor not assigned", "سپروائزر مقرر نہیں"))}
                      </div>
                    </td>
                    <td className={cell}>
                      <bdi className="whitespace-nowrap tabular-nums">
                        {clockRange(row.extraStart, row.extraEnd)}
                      </bdi>
                      <div className="mt-1 text-muted-foreground">
                        {row.kind === "planned" ? text("مخططة", "Planned", "منصوبہ بند") : text("فعلية", "Actual", "حقیقی")} ·{" "}
                        {durationLabel(row.minutes, language)}
                      </div>
                    </td>
                    {centers.map((center) => {
                      const matched = center.id === (row.costCenterId ?? -1);
                      return (
                        <Fragment key={center.id}>
                          <td
                            className={`${cell} text-center text-sm tabular-nums ${matched ? "font-semibold" : "text-muted-foreground"}`}
                          >
                            {matched ? duration.hours : "—"}
                          </td>
                          <td
                            className={`${cell} text-center text-sm tabular-nums ${matched ? "font-semibold" : "text-muted-foreground"}`}
                          >
                            {matched ? duration.minutes : "—"}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className={cell}>
                      <Badge
                        variant="outline"
                        className={
                          row.reviewStatus === "rejected"
                            ? "border-red-400/40 text-red-700 dark:text-red-300"
                            : row.reviewStatus === "approved"
                              ? "border-emerald-400/40 text-emerald-700 dark:text-emerald-300"
                              : "text-amber-800 dark:text-amber-200"
                        }
                      >
                        {row.reviewStatus === "approved"
                          ? text("قبول مبدئي", "Initially approved", "ابتدائی منظوری")
                          : row.reviewStatus === "rejected"
                            ? text("مرفوض", "Rejected", "مسترد")
                            : text("بانتظار المراجعة", "Awaiting review", "جائزے کا انتظار")}
                      </Badge>
                      <div className="mt-2 text-muted-foreground">
                        {normalizeDigits(
                          row.reviewedByName ?? row.supervisorName ?? "—",
                        )}
                      </div>
                      <p
                        className="mt-1 line-clamp-2 max-w-52 whitespace-pre-wrap text-muted-foreground"
                        title={normalizeDigits(
                          row.reviewNote ?? row.reason ?? "",
                        )}
                      >
                        {normalizeDigits(row.reviewNote ?? row.reason ?? "")}
                      </p>
                    </td>
                    <td className={cell}>
                      <Badge
                        variant="outline"
                        className={
                          row.status === "rejected"
                            ? "border-red-400/40 text-red-700 dark:text-red-300"
                            : row.status === "approved"
                              ? "border-emerald-400/40 text-emerald-700 dark:text-emerald-300"
                              : "text-amber-800 dark:text-amber-200"
                        }
                      >
                        {statusLabel(row, language)}
                      </Badge>
                      {row.approvedByName && (
                        <div className="mt-2 text-muted-foreground">
                          {normalizeDigits(row.approvedByName)}
                        </div>
                      )}
                      <p
                        className="mt-1 line-clamp-2 max-w-52 whitespace-pre-wrap text-muted-foreground"
                        title={normalizeDigits(row.decisionNote ?? "")}
                      >
                        {normalizeDigits(row.decisionNote ?? "")}
                      </p>
                    </td>
                    <td
                      className={`${cell} z-10 border-r bg-card group-hover:bg-secondary sm:sticky ${stickyAction}`}
                    >
                      <Button
                        size="sm"
                        variant={
                          row.canReview ||
                          row.canDecide ||
                          row.canReopen ||
                          row.canSubmit
                            ? "default"
                            : "outline"
                        }
                        onClick={() => onOpen(row)}
                      >
                        {row.canReview
                          ? text("مراجعة", "Review", "جائزہ")
                          : row.canDecide
                            ? text("اتخاذ القرار", "Decide", "فیصلہ کریں")
                            : row.canReopen
                              ? text("إعادة فتح الرفض", "Reopen rejection", "مسترد درخواست دوبارہ کھولیں")
                              : row.canSubmit
                                ? text("إرسال للمشرف", "Send to supervisor", "سپروائزر کو بھیجیں")
                                : text("التفاصيل", "Details", "تفصیلات")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {(loading || !rows.length) && (
        <p
          role="status"
          className="px-5 py-12 text-center text-sm text-muted-foreground"
        >
          {loading
            ? text("جارٍ تحميل العمل الإضافي…", "Loading overtime…", "اوور ٹائم لوڈ ہو رہا ہے…")
            : text("لا توجد زيادات مطابقة للفلاتر المختارة.", "No overtime matches the selected filters.", "منتخب فلٹرز سے مطابقت رکھنے والا کوئی اوور ٹائم نہیں۔")}
        </p>
      )}
    </div>
  );
}
