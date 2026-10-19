import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  branches,
  locations,
  locationDepartments,
  branchLocations,
  departments,
  jobTitles,
  workers,
  workerSalaries,
  workerScheduleSettings,
  supervisorAssignments,
  type InsertWorker,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import { riyadhToday } from "../../../shared/weekly-schedule";

export type WorkerStatus = "active" | "inactive" | "on_leave" | "terminated";
export interface WorkerListFilters {
  workerIds?: number[];
  supervisorUserId?: number;
  search?: string;
  departmentId?: number;
  jobTitleId?: number;
  status?: WorkerStatus;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

/** A supervisor is a user account; the legacy workers.primarySupervisorId is unrelated. */
function supervisorWorkerCondition(supervisorUserId: number) {
  const day = riyadhToday();
  // effectiveFrom/effectiveTo are DATE fields, with an inclusive final day.
  return sql<boolean>`exists (select 1 from ${supervisorAssignments} where ${supervisorAssignments.workerId} = ${workers.id} and ${supervisorAssignments.supervisorId} = ${supervisorUserId} and ${supervisorAssignments.effectiveFrom} <= ${day} and (${supervisorAssignments.effectiveTo} is null or ${supervisorAssignments.effectiveTo} >= ${day}))`;
}

export async function getWorkerById(
  workerId: number,
  supervisorUserId?: number,
) {
  const db = await getDb();
  if (!db) return undefined;
  const [worker] = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.id, workerId),
        supervisorUserId !== undefined
          ? supervisorWorkerCondition(supervisorUserId)
          : undefined,
      ),
    )
    .limit(1);
  return worker;
}

export async function getWorkerByEmployeeId(
  employeeId: string,
  supervisorUserId?: number,
) {
  const db = await getDb();
  if (!db) return undefined;
  const [worker] = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.employeeId, employeeId),
        supervisorUserId !== undefined
          ? supervisorWorkerCondition(supervisorUserId)
          : undefined,
      ),
    )
    .limit(1);
  return worker;
}

export async function getWorkerByFingerprintId(fingerprintId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [worker] = await db
    .select()
    .from(workers)
    .where(eq(workers.fingerprintId, fingerprintId))
    .limit(1);
  return worker;
}

export async function listWorkers(filters: WorkerListFilters) {
  const db = await getDb();
  if (!db)
    return {
      items: [],
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: 0,
    };

  const conditions = [];
  if (filters.workerIds !== undefined)
    conditions.push(filters.workerIds.length ? inArray(workers.id, filters.workerIds) : sql`1 = 0`);
  if (filters.supervisorUserId !== undefined)
    conditions.push(supervisorWorkerCondition(filters.supervisorUserId));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        like(workers.employeeId, term),
        like(workers.nameAr, term),
        like(workers.nameEn, term),
        like(workers.nameUr, term),
        like(workers.fingerprintId, term),
      ),
    );
  }
  if (filters.departmentId)
    conditions.push(eq(workers.departmentId, filters.departmentId));
  if (filters.jobTitleId)
    conditions.push(eq(workers.jobTitleId, filters.jobTitleId));
  if (filters.status) conditions.push(eq(workers.status, filters.status));
  if (filters.isActive !== undefined)
    conditions.push(eq(workers.isActive, filters.isActive));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.pageSize;
  const itemsQuery = db
    .select()
    .from(workers)
    .orderBy(asc(workers.employeeId))
    .limit(filters.pageSize)
    .offset(offset);
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(workers);
  const [items, countRows] = await Promise.all([
    whereClause ? itemsQuery.where(whereClause) : itemsQuery,
    whereClause ? countQuery.where(whereClause) : countQuery,
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function insertWorker(input: InsertWorker) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  const result = await db.insert(workers).values(input);
  const insertId = Number(
    (result as any)[0]?.insertId ?? (result as any).insertId,
  );
  return getWorkerById(insertId);
}

export async function updateWorker(
  workerId: number,
  values: Partial<InsertWorker>,
  centerCode?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  await db.transaction(async tx => {
    await tx.update(workers).set(values).where(eq(workers.id, workerId));
    if (centerCode) await tx.update(workerScheduleSettings).set({branch:centerCode}).where(eq(workerScheduleSettings.workerId,workerId));
  });
  return getWorkerById(workerId);
}

export async function getWorkersByDepartment(departmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workers)
    .where(
      and(eq(workers.departmentId, departmentId), eq(workers.isActive, true)),
    )
    .orderBy(asc(workers.nameAr));
}

export async function getWorkersBySupervisor(supervisorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.primarySupervisorId, supervisorId),
        eq(workers.isActive, true),
      ),
    )
    .orderBy(asc(workers.nameAr));
}

export async function getAllActiveWorkers(supervisorUserId?: number, workerIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.isActive, true),
        workerIds === undefined ? undefined : workerIds.length ? inArray(workers.id, workerIds) : sql`1 = 0`,
        supervisorUserId !== undefined
          ? supervisorWorkerCondition(supervisorUserId)
          : undefined,
      ),
    )
    .orderBy(asc(workers.employeeId));
}

export async function getAllDepartments() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.nameAr));
}

export async function getDepartmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [department] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1);
  return department;
}

export async function getJobTitleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [jobTitle] = await db
    .select()
    .from(jobTitles)
    .where(eq(jobTitles.id, id))
    .limit(1);
  return jobTitle;
}

export async function getJobTitlesByDepartment(departmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(jobTitles)
    .where(
      and(
        eq(jobTitles.departmentId, departmentId),
        eq(jobTitles.isActive, true),
      ),
    )
    .orderBy(asc(jobTitles.titleAr));
}

export async function getCurrentSalary(workerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [salary] = await db
    .select()
    .from(workerSalaries)
    .where(eq(workerSalaries.workerId, workerId))
    .orderBy(desc(workerSalaries.effectiveFrom))
    .limit(1);
  return salary;
}

export async function getSalaryHistory(workerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workerSalaries)
    .where(eq(workerSalaries.workerId, workerId))
    .orderBy(desc(workerSalaries.effectiveFrom));
}

export async function getDutySettings(workerId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  const [settings] = await db
    .select()
    .from(workerScheduleSettings)
    .where(eq(workerScheduleSettings.workerId, workerId))
    .limit(1);
  return settings;
}

export async function getBranchByCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.code, code))
    .limit(1);
  return branch;
}

export async function getAllLocations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.nameAr));
}

export async function locationCenters(locationId: number, departmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  return db.select({ id: branches.id, code: branches.code }).from(branches)
    .innerJoin(branchLocations, eq(branchLocations.branchId, branches.id))
    .innerJoin(locations, eq(locations.id, branchLocations.locationId))
    .innerJoin(locationDepartments, eq(locationDepartments.locationId, locations.id))
    .where(and(eq(locations.id, locationId), eq(locationDepartments.departmentId, departmentId), eq(locations.isActive, true), eq(branches.isActive, true)));
}

/** Update the work budget without inventing a shift or overwriting existing patterns. */
export async function saveDutySettings(
  workerId: number,
  input: {
    requiredDailyHours: number;
    weeklyRestDay: number | null;
    branch: string | null;
  },
  maxDailyHours: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_AVAILABLE");
  const existing = await getDutySettings(workerId);
  const values = {
    requiredHoursPerDay: String(input.requiredDailyHours),
    weeklyRestDay: input.weeklyRestDay,
    branch: input.branch,
    maxDailyHours: String(maxDailyHours),
  };
  if (existing)
    await db
      .update(workerScheduleSettings)
      .set(values)
      .where(eq(workerScheduleSettings.workerId, workerId));
  else
    await db.insert(workerScheduleSettings).values({
      workerId,
      ...values,
      standardMonthlyHours: "0",
    });
  return getDutySettings(workerId);
}
