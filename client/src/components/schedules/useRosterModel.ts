import { useLayoutEffect, useMemo, useRef } from "react";
import { reconcileRosterModel, type BoardAssignment, type BoardWorker, type RosterDraft, type RosterSnapshot } from "./weekly-board-model";

/** Cache only committed renders; abandoned renders never mutate the previous snapshot. */
export function useRosterModel(
  workers: BoardWorker[], assignments: BoardAssignment[], dates: string[],
  drafts: Record<string, RosterDraft>, ownerId: number | undefined,
) {
  const committed = useRef<RosterSnapshot | undefined>(undefined);
  const snapshot = useMemo(() => reconcileRosterModel(committed.current,
    { workers, assignments, dates, drafts, ownerId }), [workers, assignments, dates, drafts, ownerId]);
  useLayoutEffect(() => { committed.current = snapshot; }, [snapshot]);
  return snapshot.model;
}
