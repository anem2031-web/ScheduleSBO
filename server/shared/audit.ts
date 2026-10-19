import { and, desc, eq } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema";
import { getDb } from "./db";

/**
 * ============================================================================
 * Audit Logging (Cross-cutting concern)
 * ----------------------------------------------------------------------------
 * سجل التدقيق مطلوب من كل الوحدات تقريبًا، لذلك مكانه shared وليس داخل وحدة.
 * ============================================================================
 */

export async function createAuditLog(
  entityType: string,
  entityId: number,
  action: "create" | "update" | "delete" | "approve" | "reject",
  performedBy: number,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>,
  reason?: string,
  referenceDocument?: string
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create audit log: database not available");
    return;
  }

  try {
    await db.insert(auditLogs).values({
      entityType,
      entityId,
      action,
      performedBy,
      oldValues: oldValues ? JSON.stringify(oldValues) : undefined,
      newValues: newValues ? JSON.stringify(newValues) : undefined,
      reason,
      referenceDocument,
    });
  } catch (error) {
    console.error("[Database] Failed to create audit log:", error);
  }
}

export async function getAuditLogs(
  entityType?: string,
  entityId?: number,
  limit: number = 100
) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(auditLogs);

  if (entityType && entityId) {
    query = query.where(
      and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId))
    ) as any;
  } else if (entityType) {
    query = query.where(eq(auditLogs.entityType, entityType)) as any;
  }

  return (query as any).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
