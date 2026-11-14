import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  activeSupervisorLink,
  type DirectInterval,
} from "@shared/weekly-schedule";
import { formatNumber, normalizeDigits } from "@shared/display-format";
import type {
  BoardWorker,
  RosterCellModel,
  RosterWorkerModel,
} from "./weekly-board-model";
import { chronologicalPeriodOrder, periodClockRange, periodDestinationText, periodTimeLabel, type DestinationCatalog } from "./period-destination";
import { useLanguage, type Language } from "@/lib/i18n";

const hours = (minutes: number, language: Language) =>
  `${formatNumber(minutes / 60, { maximumFractionDigits: 2 })} ${{ ar: "س", en: "h", ur: "گھنٹے" }[language]}`;

type EditCell = (
  workerId: number,
  date: string,
  intervals: readonly DirectInterval[],
) => void;

/** A draft for another day does not redraw this cell when its model is unchanged. */
const WeeklyRosterCell = memo(function WeeklyRosterCell({
  worker,
  date,
  cell,
  editable,
  savePending,
  onEdit,
  destinations,
  ownerId,
}: {
  worker: BoardWorker;
  date: string;
  cell: RosterCellModel;
  editable: boolean;
  savePending: boolean;
  onEdit: EditCell;
  destinations: DestinationCatalog;
  ownerId?: number;
}) {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const { mine, others, rest, total, changed, permissions } = cell;
  return (
    <td
      className={`border-r p-2 ${changed ? "bg-amber-50/70 dark:bg-amber-950/40" : rest ? "bg-muted/40" : ""}`}
    >
      <div className="space-y-1">
        {rest && (
          <div className={`rounded px-2 py-1 text-xs ${/سنوية|V\d+/.test(rest) ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : "bg-muted"}`}>
            {rest === "راحة أسبوعية" ? text("راحة أسبوعية", "Weekly day off", "ہفتہ وار چھٹی") : normalizeDigits(rest)}
          </div>
        )}
        {permissions.map((permission) => (
          <div
            key={permission.id}
            className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900"
          >
            {text("استئذان", "Time off", "عارضی چھٹی")}{" "}
            <span dir="ltr">
              {normalizeDigits(permission.startTime.slice(0, 5))}–
              {normalizeDigits(permission.endTime.slice(0, 5))}
            </span>{" "}
            · {permission.mode === "excused" ? text("معفى", "Excused", "معاف") : text("يتطلب تعويضًا", "Make-up required", "وقت پورا کرنا ہوگا")}
          </div>
        ))}
        {chronologicalPeriodOrder(mine, others).map(({ kind, index }) => {
          const isMine = kind === "mine";
          const period = isMine ? mine[index] : others[index];
          const periodOwner = isMine ? ownerId : others[index].supervisorId;
          const ownerName = worker.supervisors.find((item) => item.id === periodOwner)?.name ??
            (!isMine ? others[index].supervisorName : "");
          return <div key={`${kind}-${isMine ? index : others[index].id}`}
            className={`rounded px-2 py-1 text-center text-xs ${isMine ? "bg-blue-50 text-blue-800" : "bg-violet-50 text-violet-800"}`}>
            <div className="mb-1">{(() => { const label = periodTimeLabel(period.startTime); return label === "صباحًا" ? text(label, "Morning", "صبح") : label === "مساءً" ? text(label, "Evening", "شام") : label === "بعد الظهر" ? text(label, "Afternoon", "دوپہر") : text(label, "Night", "رات"); })()}</div>
            <div dir="ltr">{normalizeDigits(periodClockRange(period.startTime, period.endTime))}</div>
            {!!period.breakMinutes && <div>{text("راحة", "Break", "وقفہ")} {period.breakMinutes} {text("دقيقة", "min", "منٹ")}</div>}
            <div className="mt-1 break-words leading-5">{normalizeDigits(periodDestinationText(period, worker, destinations))}</div>
            {ownerName && <div className="mt-1 break-words">{normalizeDigits(ownerName)}</div>}
          </div>;
        })}
        {(total > 0 || (!rest && cell.required !== null)) && (
          <p
            className={`py-1 text-center text-xs ${cell.required !== null && total > cell.required ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}
          >
            {hours(total, language)}
            {cell.required !== null && !rest
              ? ` · ${total <= cell.required ? `${text("متبقي", "Remaining", "باقی")} ${hours(cell.required - total, language)}` : `${text("زيادة مخططة", "Planned overtime", "منصوبہ بند اضافی وقت")} ${hours(total - cell.required, language)}`}`
              : ""}
          </p>
        )}
        {editable && (!rest || mine.length > 0) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs"
            disabled={savePending}
            onClick={() => onEdit(worker.id, date, mine)}
          >
            {mine.length ? text("تعديل فتراتي", "Edit my shifts", "میری شفٹوں میں ترمیم") : text("+ إضافة فترة", "+ Add shift", "+ شفٹ شامل کریں")}
          </Button>
        )}
      </div>
    </td>
  );
});

/** Stable row props let unrelated workers keep their rendered rows while one draft changes. */
export const WeeklyRosterRow = memo(function WeeklyRosterRow({
  worker,
  model,
  dates,
  selected,
  canSelect,
  editingEnabled,
  ownerId,
  weekLocked,
  savePending,
  rowIndex,
  onSelect,
  onEdit,
  measureRow,
  destinations,
}: {
  worker: BoardWorker;
  model: RosterWorkerModel;
  dates: readonly string[];
  selected: boolean;
  canSelect: boolean;
  editingEnabled: boolean;
  ownerId: number | undefined;
  weekLocked: boolean;
  savePending: boolean;
  rowIndex: number;
  onSelect: (workerId: number, checked: boolean) => void;
  onEdit: EditCell;
  measureRow: (workerId: number, node: HTMLTableRowElement | null) => void;
  destinations: DestinationCatalog;
}) {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const rowRef = useCallback(
    (node: HTMLTableRowElement | null) => measureRow(worker.id, node),
    [worker.id, measureRow],
  );
  const { planned, required, cells } = model;
  return (
    <tr ref={rowRef} aria-rowindex={rowIndex} className="border-t align-top">
      <td className={`sticky ${language === "en" ? "left-0" : "right-0"} z-10 bg-background p-3`}>
        <div className="flex items-start gap-2">
          {canSelect && (
            <input
              className="mt-1"
              type="checkbox"
              aria-label={`تحديد ${normalizeDigits(worker.name)}`}
              checked={selected}
              onChange={(event) => onSelect(worker.id, event.target.checked)}
            />
          )}
          <div>
            <a
              className="font-semibold hover:underline"
              href={`/workers/${worker.id}`}
            >
              {normalizeDigits(worker.name)}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              {normalizeDigits(worker.employeeId)} ·{" "}
              {normalizeDigits(worker.departmentName)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {normalizeDigits(worker.costCenter)} /{" "}
              {normalizeDigits(worker.locationName)}
            </p>
            {worker.requiredDailyMinutes === null && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {text("أكمل بطاقة الدوام أولًا", "Complete the work profile first", "پہلے اوقات کا پروفائل مکمل کریں")}
              </p>
            )}
          </div>
        </div>
      </td>
      {dates.map((date) => (
        <WeeklyRosterCell
          key={date}
          worker={worker}
          date={date}
          cell={cells.get(date)!}
          editable={
            editingEnabled &&
            !weekLocked &&
            !!ownerId &&
            worker.supervisors.some(
              (supervisor) =>
                supervisor.id === ownerId &&
                activeSupervisorLink(supervisor, date),
            )
          }
          savePending={savePending}
          onEdit={onEdit}
          destinations={destinations}
          ownerId={ownerId}
        />
      ))}
      <td className="border-r p-3 text-xs">
        <p>
          {text("مخطط", "Planned", "منصوبہ بند")}: <b>{hours(planned, language)}</b>
        </p>
        <p className="mt-2">
          {text("مطلوب", "Required", "مطلوب")}: <b>{required === null ? text("غير محدد", "Not set", "مقرر نہیں") : hours(required, language)}</b>
        </p>
        <p
          className={`mt-2 ${required !== null && planned > required ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}
        >
          {required === null
            ? text("أكمل ساعات البطاقة", "Complete profile hours", "پروفائل کے اوقات مکمل کریں")
            : planned > required
              ? `${text("زيادة مخططة", "Planned overtime", "منصوبہ بند اضافی وقت")} ${hours(planned - required, language)}`
              : `${text("متبقي", "Remaining", "باقی")} ${hours(required - planned, language)}`}
        </p>
      </td>
    </tr>
  );
});
