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

const hours = (minutes: number) =>
  `${formatNumber(minutes / 60, { maximumFractionDigits: 2 })} س`;

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
  const { mine, others, rest, total, changed, permissions } = cell;
  return (
    <td
      className={`border-r p-2 ${changed ? "bg-amber-50/70 dark:bg-amber-950/40" : rest ? "bg-muted/40" : ""}`}
    >
      <div className="space-y-1">
        {rest && (
          <div className={`rounded px-2 py-1 text-xs ${/سنوية|V\d+/.test(rest) ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : "bg-muted"}`}>
            {normalizeDigits(rest)}
          </div>
        )}
        {permissions.map((permission) => (
          <div
            key={permission.id}
            className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900"
          >
            استئذان{" "}
            <span dir="ltr">
              {normalizeDigits(permission.startTime.slice(0, 5))}–
              {normalizeDigits(permission.endTime.slice(0, 5))}
            </span>{" "}
            · {permission.mode === "excused" ? "معفى" : "يتطلب تعويضًا"}
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
            <div className="mb-1">{periodTimeLabel(period.startTime)}</div>
            <div dir="ltr">{normalizeDigits(periodClockRange(period.startTime, period.endTime))}</div>
            {!!period.breakMinutes && <div>راحة {period.breakMinutes} دقيقة</div>}
            <div className="mt-1 break-words leading-5">{normalizeDigits(periodDestinationText(period, worker, destinations))}</div>
            {ownerName && <div className="mt-1 break-words">{normalizeDigits(ownerName)}</div>}
          </div>;
        })}
        {(total > 0 || (!rest && worker.requiredDailyMinutes !== null)) && (
          <p
            className={`py-1 text-center text-xs ${worker.requiredDailyMinutes !== null && total > worker.requiredDailyMinutes ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}
          >
            {hours(total)}
            {worker.requiredDailyMinutes !== null && !rest
              ? ` · ${total <= worker.requiredDailyMinutes ? `متبقي ${hours(worker.requiredDailyMinutes - total)}` : `زيادة مخططة ${hours(total - worker.requiredDailyMinutes)}`}`
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
            {mine.length ? "تعديل فتراتي" : "+ إضافة فترة"}
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
  const rowRef = useCallback(
    (node: HTMLTableRowElement | null) => measureRow(worker.id, node),
    [worker.id, measureRow],
  );
  const { planned, required, cells } = model;
  return (
    <tr ref={rowRef} aria-rowindex={rowIndex} className="border-t align-top">
      <td className="sticky right-0 z-10 bg-background p-3">
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
                أكمل بطاقة الدوام أولًا
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
          مخطط: <b>{hours(planned)}</b>
        </p>
        <p className="mt-2">
          مطلوب: <b>{required === null ? "غير محدد" : hours(required)}</b>
        </p>
        <p
          className={`mt-2 ${required !== null && planned > required ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}
        >
          {required === null
            ? "أكمل ساعات البطاقة"
            : planned > required
              ? `زيادة مخططة ${hours(planned - required)}`
              : `متبقي ${hours(required - planned)}`}
        </p>
      </td>
    </tr>
  );
});
