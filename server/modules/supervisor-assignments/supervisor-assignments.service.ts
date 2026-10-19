import { createAuditLog } from "../../shared/audit";
import { getDb } from "../../shared/db";
import { users, workers } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import * as repo from "./supervisor-assignments.repository";
import { getScopedWorkerIds, type ScopeUser } from "../../shared/worker-scope";

/**
 * ============================================================================
 * Supervisor Assignments Service
 * إسناد عامل لمشرف (حساب مستخدم بدور supervisor)
 * القاعدة: يوجد إسناد "أساسي" واحد نشط فقط لكل عامل في نفس الوقت — إسناد
 * أساسي جديد يُغلق (effectiveTo = اليوم) الإسناد الأساسي النشط السابق تلقائيًا.
 * ============================================================================
 */

export class SupervisorAssignmentError extends Error {
  constructor(
    public code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "SupervisorAssignmentError";
  }
}

export const listAssignments = repo.listAssignments;

/** A supervisor can see all collaborators for their own workers, without seeing other teams. */
export async function listAssignmentsForViewer(
  viewer: ScopeUser,
  activeOnly?: boolean,
) {
  if (viewer.role !== "supervisor") {
    const ids = await getScopedWorkerIds(viewer);
    return ids === undefined ? repo.listAssignments(activeOnly) : repo.listAssignments(activeOnly, ids);
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const workerIds = viewer.accessScope ? await getScopedWorkerIds(viewer, today) : await repo.currentWorkerIds(viewer.id, today);
  return repo.listAssignments(activeOnly, workerIds);
}

export async function createAssignment(input: {
  workerId: number;
  supervisorId: number;
  assignmentType: "primary" | "secondary" | "temporary";
  effectiveFrom?: Date;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [worker] = await db
    .select()
    .from(workers)
    .where(eq(workers.id, input.workerId))
    .limit(1);
  if (!worker) {
    throw new SupervisorAssignmentError(
      "NOT_FOUND",
      `العامل #${input.workerId} غير موجود`,
    );
  }

  const [supervisor] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.supervisorId))
    .limit(1);
  if (!supervisor) {
    throw new SupervisorAssignmentError(
      "NOT_FOUND",
      `المستخدم #${input.supervisorId} غير موجود`,
    );
  }
  if (supervisor.role !== "supervisor") {
    throw new SupervisorAssignmentError(
      "BAD_REQUEST",
      `المستخدم "${supervisor.name}" ليس بدور مشرف (دوره الحالي: ${supervisor.role})`,
    );
  }
  if (!supervisor.isActive) {
    throw new SupervisorAssignmentError(
      "BAD_REQUEST",
      "هذا المشرف مؤرشف أو معطل؛ استعد حسابه قبل ربط عامل جديد به",
    );
  }

  const effectiveFrom = input.effectiveFrom ?? new Date();

  if (input.assignmentType === "primary") {
    const existing = await repo.findActivePrimaryByWorker(input.workerId);
    if (existing) {
      await repo.closeAssignment(existing.id, effectiveFrom);
      await createAuditLog(
        "supervisor_assignment",
        existing.id,
        "update",
        input.createdBy,
        { effectiveTo: null },
        { effectiveTo: effectiveFrom },
        "أُغلق تلقائيًا بسبب إسناد مشرف أساسي جديد",
      );
    }
  }

  const id = await repo.insertAssignment({
    workerId: input.workerId,
    supervisorId: input.supervisorId,
    assignmentType: input.assignmentType,
    effectiveFrom,
  });

  await createAuditLog(
    "supervisor_assignment",
    id,
    "create",
    input.createdBy,
    undefined,
    {
      workerId: input.workerId,
      supervisorId: input.supervisorId,
      assignmentType: input.assignmentType,
    },
  );

  return repo.findById(id);
}

export async function endAssignment(input: {
  assignmentId: number;
  endedBy: number;
}) {
  const assignment = await repo.findById(input.assignmentId);
  if (!assignment) {
    throw new SupervisorAssignmentError(
      "NOT_FOUND",
      `الإسناد #${input.assignmentId} غير موجود`,
    );
  }
  if (assignment.effectiveTo) {
    throw new SupervisorAssignmentError("CONFLICT", "هذا الإسناد منتهٍ بالفعل");
  }
  const effectiveTo = new Date();
  await repo.closeAssignment(input.assignmentId, effectiveTo);
  await createAuditLog(
    "supervisor_assignment",
    input.assignmentId,
    "update",
    input.endedBy,
    { effectiveTo: null },
    { effectiveTo },
  );
  return repo.findById(input.assignmentId);
}
