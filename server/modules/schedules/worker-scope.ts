import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { branches, shiftAssignments, supervisorAssignments, workers, workerScheduleSettings } from "../../../drizzle/schema";
import { riyadhToday } from "../../../shared/weekly-schedule";
import { getDb } from "../../shared/db";
import * as assignmentsService from "./assignments.service";
import { getScopedWorkerIds } from "../../shared/worker-scope";

type Actor = {
  id: number;
  role: string;
  accessScope?: { costCenterIds: number[] } | null;
};

/** Null denotes an existing role with global read access; supervisors are scoped. */
export async function readableScheduleWorkerIds(
  actor: Actor,
  fromDate = riyadhToday(),
  toDate = fromDate,
): Promise<number[] | null> {
  if (actor.role !== "supervisor" && (actor.role === "admin" || actor.role === "worker" || !actor.accessScope))
    return (await getScopedWorkerIds(actor, fromDate)) ?? null;
  if (actor.accessScope && !actor.accessScope.costCenterIds.length) return [];
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (actor.role !== "supervisor") {
    const centers = await db.select().from(branches).where(inArray(branches.id, actor.accessScope!.costCenterIds));
    const keys = centers.flatMap((center) => [String(center.id), center.code, center.nameAr]);
    if (!keys.length) return [];
    const rows = await db.select({ workerId: workers.id }).from(workers)
      .leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id))
      .where(or(inArray(workerScheduleSettings.branch, keys), sql`exists (select 1 from ${shiftAssignments}
        where ${shiftAssignments.workerId} = ${workers.id} and ${shiftAssignments.workDate} >= ${fromDate}
        and ${shiftAssignments.workDate} <= ${toDate} and ${shiftAssignments.status} in ('planned','confirmed','completed')
        and ${inArray(shiftAssignments.costCenterId, actor.accessScope!.costCenterIds)})`));
    return Array.from(new Set(rows.map((row) => row.workerId)));
  }
  const rows = await db
    .select({ workerId: supervisorAssignments.workerId })
    .from(supervisorAssignments)
    .where(
      and(
        eq(supervisorAssignments.supervisorId, actor.id),
        lte(
          supervisorAssignments.effectiveFrom,
          new Date(`${toDate}T00:00:00Z`),
        ),
        or(
          isNull(supervisorAssignments.effectiveTo),
          gte(
            supervisorAssignments.effectiveTo,
            new Date(`${fromDate}T00:00:00Z`),
          ),
        ),
      ),
    );
  const linked = Array.from(new Set(rows.map((row) => row.workerId)));
  // Links authorize the unified worker timetable; destination scopes still gate writes.
  return linked;
}

export async function assertScheduleWorkerRead(
  actor: Actor,
  workerId: number,
  fromDate?: string,
  toDate?: string,
) {
  const ids = await readableScheduleWorkerIds(actor, fromDate, toDate);
  if (ids && !ids.includes(workerId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذا العامل غير مرتبط بك خلال المدة المطلوبة",
    });
}

export async function listScopedAssignments(
  actor: Actor,
  input: Parameters<typeof assignmentsService.listAssignments>[0],
) {
  const from = input.workDate ?? input.fromDate ?? input.toDate,
    to = input.workDate ?? input.toDate ?? from;
  const ids = await readableScheduleWorkerIds(actor, from, to);
  if (ids === null) return assignmentsService.listAssignments(input);
  if (input.workerId) {
    if (!ids.includes(input.workerId))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "هذا العامل غير مرتبط بك خلال المدة المطلوبة",
      });
    return assignmentsService.listAssignments(input);
  }
  if (!ids.length) return [];
  return assignmentsService.listAssignments({ ...input, workerIds: ids });
}
