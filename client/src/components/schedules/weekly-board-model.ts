import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { intervalWorkMinutes, intervalOverlapMinutes, type DirectInterval } from "@shared/weekly-schedule";
import { directPeriod } from "./period-destination";

type Board = inferRouterOutputs<AppRouter>["schedules"]["getWeeklyBoard"];
export type BoardWorker = Board["workers"][number];
export type BoardAssignment = Board["assignments"][number];
export type RosterDraft = { workerId: number; workDate: string; intervals: DirectInterval[] };
export type RosterCellModel = {
  mine: DirectInterval[];
  others: BoardAssignment[];
  permissions: BoardWorker["permissions"];
  rest: string;
  total: number;
  changed: boolean;
  /** Cached daily contributions; saved net minutes stay authoritative. */
  planned: number;
  required: number | null;
};
export type RosterWorkerModel = {
  cells: Map<string, RosterCellModel>;
  planned: number;
  required: number | null;
};
export type RosterInput = {
  workers: BoardWorker[];
  assignments: BoardAssignment[];
  dates: string[];
  drafts: Record<string, RosterDraft>;
  ownerId: number | undefined;
};
type CellSource = {
  original: BoardAssignment[];
  permissions: BoardWorker["permissions"];
  rest: string;
  dailyMinutes: number | null;
  signature: string;
};
type RosterIndex = Map<number, Map<string, CellSource>>;
export type RosterSnapshot = {
  input: RosterInput;
  index: RosterIndex;
  model: Map<number, RosterWorkerModel>;
  signatures: Map<string, string>;
  stats: { indexedAssignments: number; recalculatedCells: number; rebuiltWorkers: number };
};
export const rosterCellKey = (workerId: number, date: string) => `${workerId}:${date}`;

export function workerRestLabel(worker: BoardWorker, date: string) {
  return worker.calendar.find((item) => item.date === date)?.label ??
    (new Date(`${date}T00:00:00Z`).getUTCDay() === worker.weeklyRestDay ? "راحة أسبوعية" : "");
}

/** Reindex source data only for page/refetch changes, never for a local draft edit. */
function indexRosterPage({ workers, assignments, dates }: RosterInput): RosterIndex {
  const byCell = new Map<string, BoardAssignment[]>();
  for (const assignment of assignments) {
    const key = rosterCellKey(assignment.workerId, assignment.workDate);
    const bucket = byCell.get(key);
    if (bucket) bucket.push(assignment);
    else byCell.set(key, [assignment]);
  }
  return new Map(workers.map((worker) => {
    const byPermissionDate = new Map<string, BoardWorker["permissions"]>();
    for (const permission of worker.permissions) {
      const bucket = byPermissionDate.get(permission.workDate);
      if (bucket) bucket.push(permission);
      else byPermissionDate.set(permission.workDate, [permission]);
    }
    const calendar = new Map<string, string>();
    for (const item of worker.calendar) {
      if (!calendar.has(item.date)) calendar.set(item.date, item.label);
    }
    const cells = new Map(dates.map((date) => {
      const original = byCell.get(rosterCellKey(worker.id, date)) ?? [];
      const permissions = byPermissionDate.get(date) ?? [];
      const rest = calendar.get(date) ??
        (new Date(`${date}T00:00:00Z`).getUTCDay() === worker.weeklyRestDay ? "راحة أسبوعية" : "");
      // Audit timestamps do not affect rendering or balances. Compare scheduling values
      // so an equivalent fresh response can retain the calculated objects.
      const signature = JSON.stringify([
        worker.requiredDailyMinutes, rest,
        worker.costCenterId, worker.locationId, worker.departmentId, worker.jobTitleId,
        worker.costCenter, worker.locationName, worker.departmentName, worker.jobTitleName,
        original.map((item) => [item.id, item.supervisorId, item.startTime, item.endTime,
          item.plannedMinutes, item.breakMinutes, item.crossesMidnight, item.status,
          item.costCenterId, item.locationId, item.departmentId, item.jobTitleId,
          item.costCenter, item.locationName, item.departmentName, item.jobTitleName, item.supervisorName]),
        permissions.map((item) => [item.id, item.startTime, item.endTime, item.minutes, item.mode]),
      ]);
      return [date, { original, permissions, rest, dailyMinutes: worker.requiredDailyMinutes, signature }] as const;
    }));
    return [worker.id, cells] as const;
  }));
}

function calculateCell(source: CellSource, draft: RosterDraft | undefined, ownerId: number | undefined): RosterCellModel {
  const { original, permissions, rest, dailyMinutes } = source;
  const mine: DirectInterval[] = draft?.intervals ?? original
    .filter((item) => item.supervisorId === ownerId)
    .map(directPeriod);
  const others = original.filter((item) => item.supervisorId !== ownerId);
  let savedMine = 0, savedOthers = 0;
  for (const item of original) {
    const net = Math.max(0, item.plannedMinutes - intervalOverlapMinutes(item, permissions));
    if (item.supervisorId === ownerId) savedMine += net;
    else savedOthers += net;
  }
  const currentMine = mine.reduce((sum, interval) => sum + Math.max(0,
    intervalWorkMinutes(interval) - intervalOverlapMinutes(interval, permissions)), 0);
  return {
    mine, others, permissions, rest,
    total: currentMine + savedOthers,
    changed: !!draft,
    planned: (draft ? currentMine : savedMine) + savedOthers,
    required: dailyMinutes === null ? null : rest ? 0 : Math.max(0, dailyMinutes -
      permissions.reduce((sum, item) => sum + (item.mode === "excused" ? item.minutes : 0), 0)),
  };
}

/** Pure reconciliation: unchanged days and workers retain their calculated references. */
export function reconcileRosterModel(previous: RosterSnapshot | undefined, input: RosterInput): RosterSnapshot {
  const reuseIndex = !!previous && previous.input.workers === input.workers &&
    previous.input.assignments === input.assignments && previous.input.dates === input.dates;
  const index = reuseIndex ? previous.index : indexRosterPage(input);
  const stats = { indexedAssignments: reuseIndex ? 0 : input.assignments.length, recalculatedCells: 0, rebuiltWorkers: 0 };
  const model = new Map<number, RosterWorkerModel>();
  const signatures = new Map<string, string>();
  let modelUnchanged = previous?.model.size === index.size;
  for (const [workerId, sourceCells] of Array.from(index)) {
    const oldWorker = previous?.model.get(workerId);
    const cells = new Map<string, RosterCellModel>();
    let rowUnchanged = oldWorker?.cells.size === sourceCells.size;
    for (const [date, source] of Array.from(sourceCells)) {
      const key = rosterCellKey(workerId, date), draft = input.drafts[key];
      const signature = JSON.stringify([source.signature, input.ownerId ?? null,
        draft ? draft.intervals.map((item) => [item.startTime, item.endTime, item.breakMinutes ?? 0,
          item.costCenterId, item.locationId, item.departmentId, item.jobTitleId]) : null]);
      const oldCell = oldWorker?.cells.get(date);
      const unchanged = !!oldCell && previous?.signatures.get(key) === signature;
      const cell = unchanged ? oldCell : calculateCell(source, draft, input.ownerId);
      if (!unchanged) stats.recalculatedCells++;
      if (cell !== oldCell) rowUnchanged = false;
      cells.set(date, cell);
      signatures.set(key, signature);
    }
    if (rowUnchanged && oldWorker) model.set(workerId, oldWorker);
    else {
      let planned = 0, required: number | null = 0;
      cells.forEach((cell) => {
        planned += cell.planned;
        if (cell.required === null) required = null;
        else if (required !== null) required += cell.required;
      });
      model.set(workerId, { cells, planned, required });
      stats.rebuiltWorkers++;
      modelUnchanged = false;
    }
  }
  return { input, index, model: modelUnchanged && previous ? previous.model : model, signatures, stats };
}

/** Initial build retained for callers without a previous snapshot. */
export function buildRosterModel(
  workers: BoardWorker[], assignments: BoardAssignment[], dates: string[],
  drafts: Record<string, RosterDraft>, ownerId: number | undefined,
) {
  return reconcileRosterModel(undefined, { workers, assignments, dates, drafts, ownerId }).model;
}
