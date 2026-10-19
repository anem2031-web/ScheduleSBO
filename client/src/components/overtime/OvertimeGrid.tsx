import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { normalizeDigits } from "@shared/display-format";
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
  "border-l border-b px-3 py-3 text-right align-middle font-medium";
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
  return (
    <div
      className="overflow-hidden rounded-xl border bg-card"
      aria-busy={loading}
    >
      <div
        className="max-h-[70vh] overflow-auto"
        tabIndex={0}
        aria-label="جدول العمل الإضافي، مرّر لعرض الأعمدة والصفوف"
      >
        <table
          className="w-full min-w-[1150px] border-separate border-spacing-0 text-right text-xs"
          aria-label="العمل الإضافي حسب العامل والفترة ومركز التكلفة"
        >
          <thead className="sticky top-0 z-20 bg-secondary">
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={`${heading} sticky right-0 z-30 min-w-44 bg-secondary`}
              >
                العامل
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-28`}>
                اليوم والتاريخ
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                الفترة الأصلية
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                الزيادة
              </th>
              {centers.map((center) => (
                <th
                  key={center.id}
                  scope="colgroup"
                  colSpan={2}
                  className={`${heading} text-center`}
                >
                  {normalizeDigits(center.nameAr)}
                </th>
              ))}
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                قرار المشرف وسببه
              </th>
              <th scope="col" rowSpan={2} className={`${heading} min-w-44`}>
                الشؤون الإدارية
              </th>
              <th
                scope="col"
                rowSpan={2}
                className={`${heading} z-30 min-w-32 border-r bg-secondary sm:sticky sm:left-0`}
              >
                الإجراء
              </th>
            </tr>
            <tr>
              {centers.map((center) => (
                <Fragment key={center.id}>
                  <th scope="col" className={`${heading} min-w-14 text-center`}>
                    ساعة
                  </th>
                  <th scope="col" className={`${heading} min-w-14 text-center`}>
                    دقيقة
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
                      className={`${cell} sticky right-0 z-10 bg-card group-hover:bg-secondary`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        className="text-right text-sm font-semibold text-primary hover:underline"
                      >
                        {normalizeDigits(row.name)}
                      </button>
                      <div className="mt-1 text-muted-foreground">
                        <bdi>{normalizeDigits(row.employeeId)}</bdi>
                        {row.id && <> · #{row.id}</>}
                      </div>
                    </td>
                    <td className={cell}>
                      {dayLabel(row.workDate)}
                      <div className="mt-1 text-muted-foreground">
                        <bdi>{row.workDate}</bdi>
                      </div>
                    </td>
                    <td className={cell}>
                      <p className="mb-1 font-medium">
                        {periodLabel(row.assignmentStart)}
                      </p>
                      <bdi className="whitespace-nowrap tabular-nums">
                        {clockRange(row.assignmentStart, row.assignmentEnd)}
                      </bdi>
                      <div className="mt-1 text-muted-foreground">
                        {normalizeDigits(row.costCenterName ?? "مركز غير محدد")}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {normalizeDigits(row.supervisorName ?? "مشرف غير مسجل")}
                      </div>
                    </td>
                    <td className={cell}>
                      <bdi className="whitespace-nowrap tabular-nums">
                        {clockRange(row.extraStart, row.extraEnd)}
                      </bdi>
                      <div className="mt-1 text-muted-foreground">
                        {row.kind === "planned" ? "مخططة" : "فعلية"} ·{" "}
                        {durationLabel(row.minutes)}
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
                          ? "قبول مبدئي"
                          : row.reviewStatus === "rejected"
                            ? "مرفوض"
                            : "بانتظار المراجعة"}
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
                        {statusLabel(row)}
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
                      className={`${cell} z-10 border-r bg-card group-hover:bg-secondary sm:sticky sm:left-0`}
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
                          ? "مراجعة"
                          : row.canDecide
                            ? "اتخاذ القرار"
                            : row.canReopen
                              ? "إعادة فتح الرفض"
                              : row.canSubmit
                                ? "إرسال للمشرف"
                                : "التفاصيل"}
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
            ? "جارٍ تحميل العمل الإضافي…"
            : "لا توجد زيادات مطابقة للفلاتر المختارة."}
        </p>
      )}
    </div>
  );
}
