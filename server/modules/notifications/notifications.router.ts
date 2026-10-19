import { protectedProcedure, router } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { notifications } from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * router للإشعارات والمهام الدورية
 * يدير الإشعارات والمهام المجدولة
 */
export const notificationsRouter = router({
  /**
   * الحصول على إشعارات المستخدم
   */
  getMyNotifications: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
      unreadOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const whereConditions = [eq(notifications.userId, ctx.user.id)];
      if (input.unreadOnly) {
        whereConditions.push(eq(notifications.isRead, false));
      }

      const items = await db
        .select()
        .from(notifications)
        .where(and(...whereConditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return items;
    }),

  /**
   * وضع علامة على إشعار كمقروء
   */
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const notification = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .limit(1);

      if (!notification.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الإشعار غير موجود" });
      }

      if (notification[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية" });
      }

      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, input.notificationId));

      return { success: true };
    }),

  /**
   * وضع علامة على جميع الإشعارات كمقروءة
   */
  markAllAsRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.isRead, false)
        ));

      return { success: true };
    }),

  /**
   * حذف إشعار
   */
  deleteNotification: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const notification = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .limit(1);

      if (!notification.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الإشعار غير موجود" });
      }

      if (notification[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية" });
      }

      await db
        .delete(notifications)
        .where(eq(notifications.id, input.notificationId));

      return { success: true };
    }),

  /**
   * الحصول على عدد الإشعارات غير المقروءة
   */
  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.isRead, false)
        ));

      return { count: result.length };
    }),

  /**
   * إرسال إشعار (للمسؤولين فقط)
   */
  sendNotification: protectedProcedure
    .input(z.object({
      userId: z.number(),
      title: z.string(),
      message: z.string(),
      type: z.enum(["info", "warning", "error", "success"]),
      actionUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // التحقق من الصلاحيات
      if (!["admin", "hr", "supervisor"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية" });
      }

      await db.insert(notifications).values({
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        actionUrl: input.actionUrl,
        isRead: false,
        createdAt: new Date(),
      });

      return { success: true };
    }),
});
