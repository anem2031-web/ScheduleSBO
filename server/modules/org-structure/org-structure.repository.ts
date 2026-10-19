import { and, asc, count, eq, inArray, notExists } from "drizzle-orm";
import {
  branches,
  locations,
  branchLocations,
  locationDepartments,
  departments,
  workers,
  jobTitles,
  workerScheduleSettings,
  schedules,
  evaluationTemplates,
  incentiveCategories,
  payrollSheets,
  shiftTemplates,
  shiftAssignments,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Org Structure Repository — استعلامات فقط
 * فرع <->> موقع <->> قسم (مركز البيانات الأساسية)
 * ============================================================================
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/** A final conditional delete protects references added after the service check. */
export class OrgDeletionConflict extends Error {}

function branchAliases(branch: { id: number; code: string; nameAr: string }) {
  return Array.from(new Set([String(branch.id), branch.code, branch.nameAr]));
}

// ---------------------------------------------------------------------------
// الفروع
// ---------------------------------------------------------------------------

export async function listBranches(activeOnly?: boolean) {
  const db = await requireDb();
  return db
    .select()
    .from(branches)
    .where(activeOnly ? eq(branches.isActive, true) : undefined)
    .orderBy(asc(branches.nameAr));
}

export async function findBranchByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.code, code))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findBranchById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertBranch(values: typeof branches.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(branches).values(values).$returningId();
  return res.id;
}

export async function updateBranch(
  id: number,
  values: Partial<typeof branches.$inferInsert>,
) {
  const db = await requireDb();
  return db.update(branches).set(values).where(eq(branches.id, id));
}

export async function countBranchLocationLinksByBranch(branchId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(branchLocations)
    .where(eq(branchLocations.branchId, branchId));
  return rows[0]?.n ?? 0;
}

export async function countWorkersByBranch(branch: {
  id: number;
  code: string;
  nameAr: string;
}) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(workerScheduleSettings)
    .where(inArray(workerScheduleSettings.branch, branchAliases(branch)));
  return rows[0]?.n ?? 0;
}

export async function deleteBranch(branch: {
  id: number;
  code: string;
  nameAr: string;
}) {
  const db = await requireDb();
  const [result] = await db.delete(branches).where(
    and(
      eq(branches.id, branch.id),
      notExists(
        db
          .select({ id: branchLocations.id })
          .from(branchLocations)
          .where(eq(branchLocations.branchId, branch.id)),
      ),
      notExists(
        db
          .select({ id: workerScheduleSettings.id })
          .from(workerScheduleSettings)
          .where(inArray(workerScheduleSettings.branch, branchAliases(branch))),
      ),
    ),
  );
  if (!result.affectedRows) throw new OrgDeletionConflict();
}

// ---------------------------------------------------------------------------
// المواقع
// ---------------------------------------------------------------------------

export async function listLocations(activeOnly?: boolean) {
  const db = await requireDb();
  return db
    .select()
    .from(locations)
    .where(activeOnly ? eq(locations.isActive, true) : undefined)
    .orderBy(asc(locations.nameAr));
}

export async function findLocationByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.code, code))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findLocationById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertLocation(values: typeof locations.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(locations).values(values).$returningId();
  return res.id;
}

/** Create the child and its context together so a failed link cannot leave an orphan. */
export async function insertLocationInBranch(
  values: typeof locations.$inferInsert,
  branchId: number,
) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [location] = await tx.insert(locations).values(values).$returningId();
    const [link] = await tx
      .insert(branchLocations)
      .values({ branchId, locationId: location.id })
      .$returningId();
    return { id: location.id, linkId: link.id };
  });
}

export async function updateLocation(
  id: number,
  values: Partial<typeof locations.$inferInsert>,
) {
  const db = await requireDb();
  return db.update(locations).set(values).where(eq(locations.id, id));
}

export async function countBranchLocationLinksByLocation(locationId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(branchLocations)
    .where(eq(branchLocations.locationId, locationId));
  return rows[0]?.n ?? 0;
}

export async function countLocationDepartmentLinksByLocation(
  locationId: number,
) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(locationDepartments)
    .where(eq(locationDepartments.locationId, locationId));
  return rows[0]?.n ?? 0;
}

export async function deleteLocation(id: number, contextBranchId?: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    // Only the explicitly confirmed context link may be removed. Other parents
    // or child departments block the conditional delete and roll this back.
    if (contextBranchId !== undefined) {
      await tx
        .delete(branchLocations)
        .where(
          and(
            eq(branchLocations.locationId, id),
            eq(branchLocations.branchId, contextBranchId),
          ),
        );
    }
    const [result] = await tx
      .delete(locations)
      .where(
        and(
          eq(locations.id, id),
          notExists(
            tx
              .select({ id: branchLocations.id })
              .from(branchLocations)
              .where(eq(branchLocations.locationId, id)),
          ),
          notExists(
            tx
              .select({ id: locationDepartments.id })
              .from(locationDepartments)
              .where(eq(locationDepartments.locationId, id)),
          ),
        ),
      );
    if (!result.affectedRows) throw new OrgDeletionConflict();
  });
}

// ---------------------------------------------------------------------------
// الأقسام (كتالوج مركزي — إضافة قدرة الإنشاء/التعديل هنا)
// ---------------------------------------------------------------------------

export async function listDepartments(activeOnly?: boolean) {
  const db = await requireDb();
  return db
    .select()
    .from(departments)
    .where(activeOnly ? eq(departments.isActive, true) : undefined)
    .orderBy(asc(departments.nameAr));
}

export async function findDepartmentByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.code, code))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findDepartmentById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertDepartment(
  values: typeof departments.$inferInsert,
) {
  const db = await requireDb();
  const [res] = await db.insert(departments).values(values).$returningId();
  return res.id;
}

export async function insertDepartmentInLocation(
  values: typeof departments.$inferInsert,
  locationId: number,
) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [department] = await tx
      .insert(departments)
      .values(values)
      .$returningId();
    const [link] = await tx
      .insert(locationDepartments)
      .values({ locationId, departmentId: department.id })
      .$returningId();
    return { id: department.id, linkId: link.id };
  });
}

export async function updateDepartment(
  id: number,
  values: Partial<typeof departments.$inferInsert>,
) {
  const db = await requireDb();
  return db.update(departments).set(values).where(eq(departments.id, id));
}

export async function countLocationDepartmentLinksByDepartment(
  departmentId: number,
) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(locationDepartments)
    .where(eq(locationDepartments.departmentId, departmentId));
  return rows[0]?.n ?? 0;
}

export async function countWorkersByDepartment(departmentId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(workers)
    .where(eq(workers.departmentId, departmentId));
  return rows[0]?.n ?? 0;
}

export async function countJobTitlesByDepartment(departmentId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(jobTitles)
    .where(eq(jobTitles.departmentId, departmentId));
  return rows[0]?.n ?? 0;
}

/** Includes historical/cancelled records, not only active operational data. */
export async function countDepartmentRecords(departmentId: number) {
  const db = await requireDb();
  const tables = [
    schedules,
    evaluationTemplates,
    incentiveCategories,
    payrollSheets,
    shiftTemplates,
    shiftAssignments,
  ];
  const counts = await Promise.all(
    tables.map(async (table) => {
      const rows = await db
        .select({ n: count() })
        .from(table)
        .where(eq(table.departmentId, departmentId));
      return rows[0]?.n ?? 0;
    }),
  );
  return counts.reduce((total, n) => total + n, 0);
}

export async function deleteDepartment(id: number, contextLocationId?: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    if (contextLocationId !== undefined) {
      await tx
        .delete(locationDepartments)
        .where(
          and(
            eq(locationDepartments.departmentId, id),
            eq(locationDepartments.locationId, contextLocationId),
          ),
        );
    }
    const references = [
      workers,
      jobTitles,
      schedules,
      evaluationTemplates,
      incentiveCategories,
      payrollSheets,
      shiftTemplates,
      shiftAssignments,
    ];
    const [result] = await tx
      .delete(departments)
      .where(
        and(
          eq(departments.id, id),
          notExists(
            tx
              .select({ id: locationDepartments.id })
              .from(locationDepartments)
              .where(eq(locationDepartments.departmentId, id)),
          ),
          ...references.map((table) =>
            notExists(
              tx
                .select({ id: table.id })
                .from(table)
                .where(eq(table.departmentId, id)),
            ),
          ),
        ),
      );
    if (!result.affectedRows) throw new OrgDeletionConflict();
  });
}

// ---------------------------------------------------------------------------
// روابط فرع <-> موقع
// ---------------------------------------------------------------------------

export async function listBranchLocationLinks() {
  const db = await requireDb();
  return db.select().from(branchLocations);
}

export async function findBranchLocationLink(
  branchId: number,
  locationId: number,
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(branchLocations)
    .where(
      and(
        eq(branchLocations.branchId, branchId),
        eq(branchLocations.locationId, locationId),
      ),
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertBranchLocationLink(
  branchId: number,
  locationId: number,
) {
  const db = await requireDb();
  const [res] = await db
    .insert(branchLocations)
    .values({ branchId, locationId })
    .$returningId();
  return res.id;
}

export async function deleteBranchLocationLink(id: number) {
  const db = await requireDb();
  return db.delete(branchLocations).where(eq(branchLocations.id, id));
}

// ---------------------------------------------------------------------------
// روابط موقع <-> قسم
// ---------------------------------------------------------------------------

export async function listLocationDepartmentLinks() {
  const db = await requireDb();
  return db.select().from(locationDepartments);
}

export async function findLocationDepartmentLink(
  locationId: number,
  departmentId: number,
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(locationDepartments)
    .where(
      and(
        eq(locationDepartments.locationId, locationId),
        eq(locationDepartments.departmentId, departmentId),
      ),
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertLocationDepartmentLink(
  locationId: number,
  departmentId: number,
) {
  const db = await requireDb();
  const [res] = await db
    .insert(locationDepartments)
    .values({ locationId, departmentId })
    .$returningId();
  return res.id;
}

export async function deleteLocationDepartmentLink(id: number) {
  const db = await requireDb();
  return db.delete(locationDepartments).where(eq(locationDepartments.id, id));
}

// ---------------------------------------------------------------------------
// المسميات الوظيفية
// ---------------------------------------------------------------------------

export async function listJobTitles(activeOnly?: boolean) {
  const db = await requireDb();
  return db
    .select()
    .from(jobTitles)
    .where(activeOnly ? eq(jobTitles.isActive, true) : undefined)
    .orderBy(asc(jobTitles.titleAr));
}

export async function findJobTitleByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(jobTitles)
    .where(eq(jobTitles.code, code))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findJobTitleById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(jobTitles)
    .where(eq(jobTitles.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function insertJobTitle(values: typeof jobTitles.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(jobTitles).values(values).$returningId();
  return res.id;
}

export async function updateJobTitle(
  id: number,
  values: Partial<typeof jobTitles.$inferInsert>,
) {
  const db = await requireDb();
  return db.update(jobTitles).set(values).where(eq(jobTitles.id, id));
}

export async function deleteJobTitle(id: number) {
  const db = await requireDb();
  return db.delete(jobTitles).where(eq(jobTitles.id, id));
}

export async function countWorkersByJobTitle(jobTitleId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ n: count() })
    .from(workers)
    .where(eq(workers.jobTitleId, jobTitleId));
  return rows[0]?.n ?? 0;
}
