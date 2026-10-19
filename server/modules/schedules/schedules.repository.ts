import { and, asc, eq, gte, lte, ne, or } from "drizzle-orm";
import {
  schedulePeriods,
  shiftTemplates,
} from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Schedules Repository — استعلامات قاعدة البيانات فقط (بدون منطق عمل)
 * يغطي S2: فترات الجداول (schedule_periods) وقوالب الورديات (shift_templates)
 * ============================================================================
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/** yyyy-mm-dd -> Date (UTC منتصف الليل) */
function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

// ---------------------------------------------------------------------------
// فترات الجداول
// ---------------------------------------------------------------------------

export async function findPeriodById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(schedulePeriods)
    .where(eq(schedulePeriods.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function listPeriods(filters?: {
  status?: (typeof schedulePeriods.$inferSelect)["status"];
  fromDate?: string;
  toDate?: string;
}) {
  const db = await requireDb();
  const conditions = [];
  if (filters?.status) conditions.push(eq(schedulePeriods.status, filters.status));
  if (filters?.fromDate)
    conditions.push(gte(schedulePeriods.startDate, toDate(filters.fromDate)));
  if (filters?.toDate)
    conditions.push(lte(schedulePeriods.endDate, toDate(filters.toDate)));
  return db
    .select()
    .from(schedulePeriods)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schedulePeriods.startDate));
}

/** فترات (غير ملغاة) تتداخل مع المدى المعطى — لكشف تعارض الفترات */
export async function findOverlappingPeriods(
  startDate: string,
  endDate: string,
  excludeId?: number
) {
  const db = await requireDb();
  const overlap = and(
    lte(schedulePeriods.startDate, toDate(endDate)),
    gte(schedulePeriods.endDate, toDate(startDate)),
    ne(schedulePeriods.status, "cancelled")
  );
  const where = excludeId
    ? and(overlap, ne(schedulePeriods.id, excludeId))
    : overlap;
  return db.select().from(schedulePeriods).where(where);
}

export async function insertPeriod(
  values: typeof schedulePeriods.$inferInsert
) {
  const db = await requireDb();
  const [res] = await db.insert(schedulePeriods).values(values).$returningId();
  return res.id;
}

export async function updatePeriod(
  id: number,
  values: Partial<typeof schedulePeriods.$inferInsert>
) {
  const db = await requireDb();
  return db
    .update(schedulePeriods)
    .set(values)
    .where(eq(schedulePeriods.id, id));
}

// ---------------------------------------------------------------------------
// قوالب الورديات
// ---------------------------------------------------------------------------

export async function findShiftTemplateById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(shiftTemplates)
    .where(eq(shiftTemplates.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function findShiftTemplateByCode(code: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(shiftTemplates)
    .where(eq(shiftTemplates.code, code))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function listShiftTemplates(filters?: {
  activeOnly?: boolean;
  departmentId?: number;
}) {
  const db = await requireDb();
  const conditions = [];
  if (filters?.activeOnly) conditions.push(eq(shiftTemplates.isActive, true));
  if (filters?.departmentId !== undefined)
    conditions.push(
      or(
        eq(shiftTemplates.departmentId, filters.departmentId),
        // القوالب العامة (بدون قسم) متاحة للجميع
        eq(shiftTemplates.departmentId as any, null as any)
      )
    );
  return db
    .select()
    .from(shiftTemplates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(shiftTemplates.startTime));
}

export async function insertShiftTemplate(
  values: typeof shiftTemplates.$inferInsert
) {
  const db = await requireDb();
  const [res] = await db.insert(shiftTemplates).values(values).$returningId();
  return res.id;
}

export async function updateShiftTemplate(
  id: number,
  values: Partial<typeof shiftTemplates.$inferInsert>
) {
  const db = await requireDb();
  return db
    .update(shiftTemplates)
    .set(values)
    .where(eq(shiftTemplates.id, id));
}
