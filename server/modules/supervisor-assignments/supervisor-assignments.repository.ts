import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { supervisorAssignments, workers, users } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Supervisor Assignments Repository — استعلامات فقط
 * الربط بين العامل (workers) وحساب المشرف (users بدور supervisor)
 * ============================================================================
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export async function listAssignments(
  activeOnly?: boolean,
  workerIds?: number[],
) {
  const db = await requireDb();
  return db
    .select({
      id: supervisorAssignments.id,
      workerId: supervisorAssignments.workerId,
      workerNameAr: workers.nameAr,
      workerEmployeeId: workers.employeeId,
      supervisorId: supervisorAssignments.supervisorId,
      supervisorName: users.name,
      supervisorEmail: users.email,
      assignmentType: supervisorAssignments.assignmentType,
      effectiveFrom: supervisorAssignments.effectiveFrom,
      effectiveTo: supervisorAssignments.effectiveTo,
      createdAt: supervisorAssignments.createdAt,
    })
    .from(supervisorAssignments)
    .innerJoin(workers, eq(supervisorAssignments.workerId, workers.id))
    .innerJoin(users, eq(supervisorAssignments.supervisorId, users.id))
    .where(
      and(
        activeOnly ? isNull(supervisorAssignments.effectiveTo) : undefined,
        workerIds === undefined
          ? undefined
          : workerIds.length
            ? inArray(supervisorAssignments.workerId, workerIds)
            : sql`1 = 0`,
      ),
    )
    .orderBy(desc(supervisorAssignments.createdAt));
}

export async function currentWorkerIds(supervisorId: number, dateKey: string) {
  const db = await requireDb();
  const rows = await db
    .select({ id: supervisorAssignments.workerId })
    .from(supervisorAssignments)
    .where(
      and(
        eq(supervisorAssignments.supervisorId, supervisorId),
        sql`DATE(${supervisorAssignments.effectiveFrom}) <= ${dateKey}`,
        or(
          isNull(supervisorAssignments.effectiveTo),
          sql`DATE(${supervisorAssignments.effectiveTo}) >= ${dateKey}`,
        ),
      ),
    );
  return Array.from(new Set(rows.map((row) => row.id)));
}

export async function findActivePrimaryByWorker(workerId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(supervisorAssignments)
    .where(
      and(
        eq(supervisorAssignments.workerId, workerId),
        eq(supervisorAssignments.assignmentType, "primary"),
        isNull(supervisorAssignments.effectiveTo),
      ),
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(supervisorAssignments)
    .where(eq(supervisorAssignments.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertAssignment(
  values: typeof supervisorAssignments.$inferInsert,
) {
  const db = await requireDb();
  const [res] = await db
    .insert(supervisorAssignments)
    .values(values)
    .$returningId();
  return res.id;
}

export async function closeAssignment(id: number, effectiveTo: Date) {
  const db = await requireDb();
  return db
    .update(supervisorAssignments)
    .set({ effectiveTo })
    .where(eq(supervisorAssignments.id, id));
}
