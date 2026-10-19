import { operationalDate, riyadhParts } from "../../../shared/operational-day";
import { addCalendarDays } from "../../../shared/weekly-schedule";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { operatingPeriods, auditLogs } from "../../../drizzle/schema";
import { eq, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createHeartbeatJob,
  updateHeartbeatJob,
  deleteHeartbeatJob,
  listHeartbeatJobs,
} from "../../_core/heartbeat";

/**
 * إنشاء endpoint للإقفال التلقائي
 * يتم استدعاء هذا الـ endpoint من قبل Heartbeat في 04:30 صباحاً
 */
export async function handleDailyLockdownCallback() {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // الحصول على التاريخ الحالي بتوقيت الرياض
    const today = new Date(
      `${addCalendarDays(operationalDate(), -1)}T00:00:00Z`,
    );

    // البحث عن الفترة التشغيلية لليوم
    const period = await db
      .select()
      .from(operatingPeriods)
      .where(eq(operatingPeriods.periodDate, today))
      .limit(1);

    if (period.length === 0) {
      // إنشاء فترة جديدة إذا لم تكن موجودة
      await db.insert(operatingPeriods).values({
        periodDate: today,
        periodType: "daily",
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: 1, // system user ID
      });
    } else if (!period[0].isLocked) {
      // تحديث الفترة الموجودة
      await db
        .update(operatingPeriods)
        .set({ isLocked: true, lockedAt: new Date(), lockedBy: 1 })
        .where(eq(operatingPeriods.id, period[0].id));
    }

    // تسجيل العملية في سجل التدقيق
    await createAuditLog(
      "operating_periods",
      period.length > 0 ? period[0].id : 0,
      "update",
      1, // system user ID
      period.length > 0 ? { isLocked: period[0].isLocked } : undefined,
      { isLocked: true },
      "الإقفال اليومي التلقائي - نافذة الإقفال 04:30",
    );

    return { success: true, message: "تم الإقفال التلقائي بنجاح" };
  } catch (error) {
    console.error("Daily lockdown callback error:", error);
    return { success: false, message: "فشل الإقفال التلقائي" };
  }
}

/**
 * router المهام الدورية والإقفال التلقائي
 * يدير المهام المجدولة والإقفال اليومي التلقائي
 */
export const scheduledTasksRouter = router({
  /**
   * الإقفال اليومي التلقائي عند 04:30 صباحاً
   * يتم تنفيذ هذه المهمة تلقائياً من قبل نظام المهام الدورية
   */
  dailyLockdown: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // التحقق من الصلاحيات - فقط المسؤولون
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية" });
    }

    try {
      // الحصول على التاريخ الحالي بتوقيت الرياض
      const today = new Date(`${operationalDate()}T00:00:00Z`);

      // البحث عن الفترة التشغيلية لليوم
      const period = await db
        .select()
        .from(operatingPeriods)
        .where(eq(operatingPeriods.periodDate, today))
        .limit(1);

      if (period.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "لم يتم العثور على فترة تشغيلية لليوم",
        });
      }

      // تحديث حالة الفترة إلى مقفولة
      await db
        .update(operatingPeriods)
        .set({ isLocked: true, lockedAt: new Date() })
        .where(eq(operatingPeriods.id, period[0].id));

      // تسجيل العملية في سجل التدقيق
      await createAuditLog(
        "operating_periods",
        period[0].id,
        "update",
        ctx.user.id,
        { isLocked: false },
        { isLocked: true },
        "الإقفال اليومي التلقائي عند 04:30 صباحاً",
      );

      return {
        success: true,
        message: "تم إقفال الفترة التشغيلية بنجاح",
        periodId: period[0].id,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الإقفال اليومي",
      });
    }
  }),

  /**
   * الحصول على حالة الإقفال اليومي
   */
  getDailyLockStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    try {
      // الحصول على التاريخ الحالي بتوقيت الرياض
      const today = new Date(`${operationalDate()}T00:00:00Z`);

      const period = await db
        .select()
        .from(operatingPeriods)
        .where(eq(operatingPeriods.periodDate, today))
        .limit(1);

      if (period.length === 0) {
        return {
          isLocked: false,
          lockedAt: null,
          message: "لا توجد فترة تشغيلية لليوم",
        };
      }

      return {
        isLocked: period[0].isLocked,
        lockedAt: period[0].lockedAt,
        periodId: period[0].id,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الحصول على حالة الإقفال",
      });
    }
  }),

  /**
   * إعادة فتح فترة تشغيلية (للمسؤولين فقط)
   */
  reopenPeriod: protectedProcedure
    .input(z.object({ periodId: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // التحقق من الصلاحيات - فقط المسؤولون
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية" });
      }

      try {
        const period = await db
          .select()
          .from(operatingPeriods)
          .where(eq(operatingPeriods.id, input.periodId))
          .limit(1);

        if (period.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الفترة غير موجودة",
          });
        }

        // تحديث حالة الفترة إلى مفتوحة
        await db
          .update(operatingPeriods)
          .set({ isLocked: false, lockedAt: null })
          .where(eq(operatingPeriods.id, input.periodId));

        // تسجيل العملية في سجل التدقيق
        await createAuditLog(
          "operating_periods",
          input.periodId,
          "update",
          ctx.user.id,
          { isLocked: true },
          { isLocked: false },
          input.reason,
        );

        return { success: true, message: "تم إعادة فتح الفترة بنجاح" };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إعادة فتح الفترة",
        });
      }
    }),

  /**
   * الحصول على سجل الإقفالات والفتحات
   */
  getLockHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const logs = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityType, "operating_periods"))
          .limit(input.limit)
          .offset(input.offset);

        return logs;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على سجل الإقفالات",
        });
      }
    }),

  /**
   * إنشاء مهمة مجدولة للإقفال التلقائي
   * يتم إنشاء مهمة Heartbeat تقوم بالإقفال التلقائي في 04:30 صباحاً بتوقيت الرياض
   */
  createScheduledTask: protectedProcedure
    .input(
      z.object({
        taskName: z.string(),
        description: z.string().optional(),
        cronExpression: z.string(),
        endpoint: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // التحقق من الصلاحيات - فقط المسؤولون
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات إنشاء مهام مجدولة",
          });
        }

        // إنشاء المهمة المجدولة عبر Heartbeat API
        const result = await createHeartbeatJob(
          {
            name: input.taskName,
            cron: input.cronExpression,
            path: input.endpoint,
            description: input.description,
          },
          String(ctx.user.id),
        );

        return {
          success: true,
          message: "تم إنشاء المهمة المجدولة بنجاح",
          taskName: input.taskName,
          taskUid: result.taskUid,
          nextExecutionAt: result.nextExecutionAt,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل إنشاء المهمة المجدولة: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
        });
      }
    }),

  /**
   * الحصول على قائمة المهام المجدولة
   */
  getScheduledTasks: protectedProcedure.query(async ({ ctx }) => {
    try {
      // التحقق من الصلاحيات - فقط المسؤولون
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحيات الوصول للمهام المجدولة",
        });
      }

      // جلب المهام المجدولة من Heartbeat API
      const result = await listHeartbeatJobs(String(ctx.user.id));

      return {
        tasks: result.jobs,
        count: result.total,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `فشل الحصول على المهام المجدولة: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
      });
    }
  }),

  /**
   * تشغيل مهمة مجدولة يدويًا
   */
  runScheduledTaskManually: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // التحقق من الصلاحيات - فقط المسؤولون
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات تشغيل المهام المجدولة",
          });
        }

        // تشغيل المهمة يدويًا عبر استدعاء الـ endpoint مباشرة
        // يتم الحصول على المهمة من قائمة المهام ثم استدعاء الـ endpoint
        const tasks = await listHeartbeatJobs(String(ctx.user.id));
        const task = tasks.jobs.find((t) => t.taskUid === input.taskId);

        if (!task) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المهمة غير موجودة",
          });
        }

        // استدعاء الـ endpoint مباشرة
        const response = await fetch(
          `http://localhost:3000${task.callbackPath}`,
          {
            method: task.callbackMethod as "POST" | "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: task.callbackPayload,
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to run task: ${response.statusText}`);
        }

        return {
          success: true,
          message: "تم تشغيل المهمة بنجاح",
          taskId: input.taskId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل تشغيل المهمة: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
        });
      }
    }),

  /**
   * إنشاء مهمة الإقفال التلقائي اليومي
   * تقوم بإقفال الفترة التشغيلية تلقائياً في 04:30 صباحاً بتوقيت الرياض
   */
  setupDailyLockJob: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // التحقق من الصلاحيات - فقط المسؤولون
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحيات إعداد المهام المجدولة",
        });
      }

      // إنشاء مهمة Heartbeat للإقفال التلقائي
      // 04:30 صباحاً بتوقيت الرياض = 01:30 UTC (في الشتاء) أو 01:30 UTC (في الصيف)
      // سنستخدم 01:30 UTC كقيمة افتراضية
      const result = await createHeartbeatJob(
        {
          name: "daily-lockdown-429",
          cron: "0 30 1 * * *", // 01:30 UTC يومياً
          path: "/api/scheduled/daily-lockdown",
          description:
            "الإقفال اليومي التلقائي للفترة التشغيلية في 04:30 صباحاً بتوقيت الرياض",
        },
        String(ctx.user.id),
      );

      return {
        success: true,
        message: "تم إعداد مهمة الإقفال التلقائي بنجاح",
        taskUid: result.taskUid,
        nextExecutionAt: result.nextExecutionAt,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `فشل إعداد مهمة الإقفال التلقائي: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
      });
    }
  }),

  /**
   * تحديث مهمة مجدولة
   */
  updateScheduledTask: protectedProcedure
    .input(
      z.object({
        taskUid: z.string(),
        cron: z.string().optional(),
        description: z.string().optional(),
        enable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // التحقق من الصلاحيات - فقط المسؤولون
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات تحديث المهام المجدولة",
          });
        }

        // تحديث المهمة عبر Heartbeat API
        const result = await updateHeartbeatJob(
          input.taskUid,
          {
            cron: input.cron,
            description: input.description,
            enable: input.enable,
          },
          String(ctx.user.id),
        );

        return {
          success: true,
          message: "تم تحديث المهمة بنجاح",
          nextExecutionAt: result.nextExecutionAt,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل تحديث المهمة: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
        });
      }
    }),

  /**
   * حذف مهمة مجدولة
   */
  deleteScheduledTask: protectedProcedure
    .input(
      z.object({
        taskUid: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // التحقق من الصلاحيات - فقط المسؤولون
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات حذف المهام المجدولة",
          });
        }

        // حذف المهمة عبر Heartbeat API
        await deleteHeartbeatJob(input.taskUid, String(ctx.user.id));

        return {
          success: true,
          message: "تم حذف المهمة بنجاح",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل حذف المهمة: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
        });
      }
    }),
});
