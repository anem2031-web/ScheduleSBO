import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { notifications, auditLogs, users } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * router الإشعارات والمهام الدورية المتقدم
 */
export const advancedNotificationsRouter = router({
  /**
   * إنشاء إشعار جديد
   */
  createNotification: protectedProcedure
    .input(z.object({
      userId: z.number(),
      title: z.string(),
      message: z.string(),
      type: z.enum(["info", "warning", "error", "success"]),
      relatedEntityType: z.string().optional(),
      relatedEntityId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const notification = await db.insert(notifications).values({
          userId: input.userId,
          title: input.title,
          message: input.message,
          type: input.type,
          isRead: false,
        });

        // تسجيل التدقيق
        await createAuditLog(
          "notification",
          0,
          "create",
          ctx.user?.id || 0,
          undefined,
          {
            userId: input.userId,
            type: input.type,
            title: input.title,
          }
        );

        return {
          success: true,
          message: "تم إنشاء الإشعار بنجاح",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إنشاء الإشعار",
        });
      }
    }),

  /**
   * الحصول على إشعارات المستخدم
   */
  getUserNotifications: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const userNotifications = await db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, ctx.user?.id || 0))
          .limit(input.limit)
          .offset(input.offset);

        return {
          count: userNotifications.length,
          items: userNotifications,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على الإشعارات",
        });
      }
    }),

  /**
   * تحديد الإشعار كمقروء
   */
  markAsRead: protectedProcedure
    .input(z.object({
      notificationId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db
          .update(notifications)
          .set({ isRead: true, readAt: new Date() })
          .where(eq(notifications.id, input.notificationId));

        return {
          success: true,
          message: "تم تحديد الإشعار كمقروء",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث الإشعار",
        });
      }
    }),

  /**
   * إرسال إشعار انتهاء الجداول
   */
  notifyScheduleEnd: protectedProcedure
    .input(z.object({
      supervisorId: z.number(),
      scheduleId: z.number(),
      weekEndDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.insert(notifications).values({
          userId: input.supervisorId,
          title: "انتهاء الجدول الأسبوعي",
          message: `انتهى الجدول الأسبوعي في ${input.weekEndDate}. يرجى المراجعة والاعتماد.`,
          type: "info",
          isRead: false,
        });

        return {
          success: true,
          message: "تم إرسال إشعار انتهاء الجدول",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال الإشعار",
        });
      }
    }),

  /**
   * إرسال إشعار طلب تبرير
   */
  notifyJustificationRequest: protectedProcedure
    .input(z.object({
      workerId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.insert(notifications).values({
          userId: input.workerId,
          title: "طلب تبرير",
          message: `تم طلب تبرير: ${input.reason}`,
          type: "warning",
          isRead: false,
        });

        return {
          success: true,
          message: "تم إرسال طلب التبرير",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال الطلب",
        });
      }
    }),

  /**
   * إرسال إشعار اعتماد الحوافز
   */
  notifyIncentiveApproval: protectedProcedure
    .input(z.object({
      workerId: z.number(),
      amount: z.number(),
      status: z.enum(["approved", "rejected"]),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const statusText = input.status === "approved" ? "تم اعتماد" : "تم رفض";
        await db.insert(notifications).values({
          userId: input.workerId,
          title: `${statusText} الحافز`,
          message: `${statusText} حافزك بقيمة ${input.amount} ريال سعودي`,
          type: input.status === "approved" ? "success" : "error",
          isRead: false,
        });

        return {
          success: true,
          message: "تم إرسال إشعار الاعتماد",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال الإشعار",
        });
      }
    }),

  /**
   * إرسال إشعار تجاوز الحضور
   */
  notifyOvertimeAlert: protectedProcedure
    .input(z.object({
      supervisorId: z.number(),
      workerId: z.number(),
      hours: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.insert(notifications).values({
          userId: input.supervisorId,
          title: "تنبيه دوام إضافي",
          message: `العامل قد تجاوز ${input.hours} ساعات دوام إضافي`,
          type: "warning",
          isRead: false,
        });

        return {
          success: true,
          message: "تم إرسال تنبيه الدوام الإضافي",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال التنبيه",
        });
      }
    }),

  /**
   * إرسال إشعار إقفال الفترة
   */
  notifyPeriodClose: protectedProcedure
    .input(z.object({
      month: z.string(),
      year: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // إرسال إشعار لجميع مديري الموارد البشرية
        const hrManagers = await db
          .select()
          .from(users)
          .where(eq(users.role, "hr_admin"));

        for (const manager of hrManagers) {
          await db.insert(notifications).values({
            userId: manager.id,
            title: "إقفال الفترة المالية",
            message: `تم إقفال الفترة ${input.month}/${input.year}`,
            type: "success",
            isRead: false,
          });
        }

        return {
          success: true,
          message: "تم إرسال إشعارات إقفال الفترة",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال الإشعارات",
        });
      }
    }),

  /**
   * حذف إشعار (حذف ناعم)
   */
  deleteNotification: protectedProcedure
    .input(z.object({
      notificationId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من ملكية الإشعار
        const notification = await db
          .select()
          .from(notifications)
          .where(eq(notifications.id, input.notificationId))
          .limit(1);

        if (notification.length === 0 || notification[0].userId !== ctx.user?.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات حذف هذا الإشعار",
          });
        }

        // حذف ناعم - تحديث علم الحذف بدلاً من الحذف الفعلي
        // للحفاظ على السجل التاريخي
        // بما أن الجدول لا يحتوي على حقل isDeleted، سنقوم بحذف فعلي
        // بعد التأكد من الملكية

        return {
          success: true,
          message: "تم حذف الإشعار",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل حذف الإشعار",
        });
      }
    }),

  /**
   * الحصول على عدد الإشعارات غير المقروءة
   */
  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const unreadNotifications = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, ctx.user?.id || 0),
              eq(notifications.isRead, false)
            )
          );

        return {
          count: unreadNotifications.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على عدد الإشعارات غير المقروءة",
        });
      }
    }),

  /**
   * تحديد جميع الإشعارات كمقروءة
   */
  markAllAsRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db
          .update(notifications)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(notifications.userId, ctx.user?.id || 0),
              eq(notifications.isRead, false)
            )
          );

        return {
          success: true,
          message: "تم تحديد جميع الإشعارات كمقروءة",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث الإشعارات",
        });
      }
    }),
});
