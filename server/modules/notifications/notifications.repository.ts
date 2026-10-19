import { desc, eq } from "drizzle-orm";
import { notifications } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";

/**
 * ============================================================================
 * Notifications Repository
 * ----------------------------------------------------------------------------
 * createNotification متاحة للوحدات الأخرى (Public API) لإرسال إشعارات —
 * استوردها من هنا مباشرة، ولا تكتب insert مباشر على جدول notifications
 * من أي وحدة ثانية.
 * ============================================================================
 */

export async function createNotification(
  userId: number,
  title: string,
  message: string,
  type: "info" | "warning" | "error" | "success" = "info",
  actionUrl?: string
) {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot create notification: database not available"
    );
    return;
  }

  try {
    await db.insert(notifications).values({
      userId,
      title,
      message,
      type,
      actionUrl,
    });
  } catch (error) {
    console.error("[Database] Failed to create notification:", error);
  }
}

export async function getUserNotifications(userId: number, unreadOnly = false) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId)) as any;

  if (unreadOnly) {
    query = query.where(eq(notifications.isRead, false));
  }

  return query.orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.id, notificationId));
}
