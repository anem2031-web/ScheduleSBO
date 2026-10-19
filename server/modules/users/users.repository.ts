import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { InsertUser, User, users } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Users Repository
 * ----------------------------------------------------------------------------
 * كل استعلامات قاعدة البيانات الخاصة بالمستخدمين. لا منطق عمل هنا — فقط وصول
 * للبيانات. منطق العمل مكانه service أو router الوحدة.
 * ============================================================================
 */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = [
      "name",
      "email",
      "loginMethod",
      "passwordHash",
      "username",
    ] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(sql`LOWER(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Username is unique and independent from the optional contact email. */
export async function getUserByLogin(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = identifier.trim().toLowerCase();
  const [user] = await db.select().from(users).where(or(eq(sql`LOWER(${users.username})`, normalized), eq(sql`LOWER(${users.email})`, normalized))).limit(1);
  return user;
}

export async function updateUserRole(userId: number, role: User["role"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}

/** Preserve all historical references while removing a supervisor from active use. */
export async function archiveSupervisor(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .update(users)
    .set({ isActive: false })
    .where(
      and(
        eq(users.id, userId),
        eq(users.role, "supervisor"),
        eq(users.isActive, true),
      ),
    );
  return result.affectedRows > 0;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUsersByRole(role: User["role"]) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(users)
    .where(and(eq(users.role, role), eq(users.isActive, true)))
    .orderBy(asc(users.name));
}
