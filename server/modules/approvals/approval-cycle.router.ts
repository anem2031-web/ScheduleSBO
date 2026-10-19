import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { incentives, payrollSheets, auditLogs } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * router دورة الاعتماد والصرف
 * يدير دورة الاعتماد ثلاثية المراحل: شؤون إدارية ← مراجع مالي ← رئيس حسابات
 */
export const approvalCycleRouter = router({
  /**
   * الحصول على الحوافز المعلقة للاعتماد
   */
  getPendingIncentives: protectedProcedure
    .input(z.object({
      stage: z.enum(["hr", "financial_reviewer", "accounting_head"]),
      month: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // الحصول على الحوافز المعلقة في المرحلة المحددة
        const pending = await db
          .select()
          .from(incentives)
          .where(
            eq(incentives.status, "calculated")
          );

        return {
          count: pending.length,
          items: pending,
          stage: input.stage,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على الحوافز المعلقة",
        });
      }
    }),

  /**
   * اعتماد الحوافز من قبل شؤون إدارية
   */
  approveByHR: protectedProcedure
    .input(z.object({
      incentiveIds: z.array(z.number()),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من الصلاحيات
        if (ctx.user?.role !== "hr_admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات الاعتماد من قبل شؤون إدارية",
          });
        }

        // تحديث حالة الحوافز
        for (const id of input.incentiveIds) {
          await db
            .update(incentives)
            .set({
              status: "approved",
            })
            .where(eq(incentives.id, id));

          // تسجيل التدقيق
          await createAuditLog(
            "incentive",
            id,
            "approve",
            ctx.user.id,
            undefined,
            {
              status: "approved",
              approvedBy: "hr_admin",
              notes: input.notes,
            },
            input.notes
          );
        }

        return {
          success: true,
          count: input.incentiveIds.length,
          message: "تم اعتماد الحوافز من قبل شؤون إدارية",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل اعتماد الحوافز",
        });
      }
    }),

  /**
   * اعتماد الحوافز من قبل مراجع مالي
   */
  approveByFinancialReviewer: protectedProcedure
    .input(z.object({
      incentiveIds: z.array(z.number()),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من الصلاحيات
        if (ctx.user?.role !== "financial_reviewer") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات الاعتماد من قبل مراجع مالي",
          });
        }

        // تحديث حالة الحوافز
        for (const id of input.incentiveIds) {
          await db
            .update(incentives)
            .set({
              status: "approved",
            })
            .where(eq(incentives.id, id));

          // تسجيل التدقيق
          await createAuditLog(
            "incentive",
            id,
            "approve",
            ctx.user.id,
            undefined,
            {
              status: "approved",
              approvedBy: "financial_reviewer",
              notes: input.notes,
            },
            input.notes
          );
        }

        return {
          success: true,
          count: input.incentiveIds.length,
          message: "تم اعتماد الحوافز من قبل مراجع مالي",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل اعتماد الحوافز",
        });
      }
    }),

  /**
   * اعتماد الحوافز من قبل رئيس الحسابات (المرحلة النهائية)
   */
  approveByAccountingHead: protectedProcedure
    .input(z.object({
      incentiveIds: z.array(z.number()),
      approved: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من الصلاحيات
        if (ctx.user?.role !== "accounting_head") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات الاعتماد من قبل رئيس حسابات",
          });
        }

        // تحديث حالة الحوافز
        for (const id of input.incentiveIds) {
          const newStatus = input.approved ? "paid" : "rejected";
          await db
            .update(incentives)
            .set({
              status: newStatus,
            })
            .where(eq(incentives.id, id));

          // تسجيل التدقيق
          await createAuditLog(
            "incentive",
            id,
            input.approved ? "approve" : "reject",
            ctx.user.id,
            undefined,
            {
              status: newStatus,
              approvedBy: "accounting_head",
              notes: input.notes,
            },
            input.notes
          );
        }

        return {
          success: true,
          count: input.incentiveIds.length,
          message: "تم اعتماد الحوافز من قبل رئيس حسابات",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل اعتماد الحوافز",
        });
      }
    }),

  /**
   * رفض الحوافز في أي مرحلة
   */
  rejectIncentives: protectedProcedure
    .input(z.object({
      incentiveIds: z.array(z.number()),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // تحديث حالة الحوافز
        for (const id of input.incentiveIds) {
          await db
            .update(incentives)
            .set({
              status: "rejected",
            })
            .where(eq(incentives.id, id));

          // تسجيل التدقيق
          await createAuditLog(
            "incentive",
            id,
            "reject",
            ctx.user.id,
            undefined,
            {
              status: "rejected",
            },
            input.reason
          );
        }

        return {
          success: true,
          count: input.incentiveIds.length,
          message: "تم رفض الحوافز",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل رفض الحوافز",
        });
      }
    }),

  /**
   * إغلاق فترة مالية
   */
  closePeriod: protectedProcedure
    .input(z.object({
      month: z.string(),
      year: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من الصلاحيات
        if (ctx.user?.role !== "accounting_head") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات إغلاق الفترات",
          });
        }

        // إنشاء كشف مستحقات للفترة
        const periodStart = new Date(input.year, parseInt(input.month) - 1, 1);
        const periodEnd = new Date(input.year, parseInt(input.month), 0);

        const payrollSheet = await db.insert(payrollSheets).values({
          payrollCode: `PAY-${input.month}-${input.year}`,
          periodStart,
          periodEnd,
          totalWorkers: 0,
          totalAmount: "0",
          status: "accounting_approved",
          accountingApprovedBy: ctx.user.id,
          accountingApprovedAt: new Date(),
        });

        // تسجيل التدقيق
        await createAuditLog(
          "payroll_period",
          0,
          "create",
          ctx.user.id,
          undefined,
          {
            month: input.month,
            year: input.year,
            status: "accounting_approved",
          }
        );

        return {
          success: true,
          message: `تم إغلاق الفترة ${input.month}/${input.year}`,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إغلاق الفترة",
        });
      }
    }),

  /**
   * إعادة فتح يوم مغلق (للمعدّل مع ورقة رسمية)
   */
  reopenDay: protectedProcedure
    .input(z.object({
      date: z.string(),
      documentUrl: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من الصلاحيات
        if (ctx.user?.role !== "modifier") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ليس لديك صلاحيات إعادة فتح الأيام",
          });
        }

        // تسجيل التدقيق
        await createAuditLog(
          "daily_close",
          0,
          "update",
          ctx.user.id,
          undefined,
          {
            date: input.date,
            action: "reopened",
          },
          input.reason,
          input.documentUrl
        );

        return {
          success: true,
          message: `تم إعادة فتح اليوم ${input.date}`,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إعادة فتح اليوم",
        });
      }
    }),

  /**
   * الحصول على كشف المستحقات للفترة
   */
  getPayrollSheet: protectedProcedure
    .input(z.object({
      month: z.string(),
      year: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const payrollCode = `PAY-${input.month}-${input.year}`;
        const sheet = await db
          .select()
          .from(payrollSheets)
          .where(eq(payrollSheets.payrollCode, payrollCode))
          .limit(1);

        if (sheet.length === 0) {
          return null;
        }

        return sheet[0];
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على كشف المستحقات",
        });
      }
    }),

  /**
   * الحصول على سجل الاعتمادات
   */
  getApprovalHistory: protectedProcedure
    .input(z.object({
      incentiveId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const history = await db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.entityType, "incentive"),
              eq(auditLogs.entityId, input.incentiveId)
            )
          )
          .orderBy(auditLogs.createdAt);

        return history.map(log => ({
          ...log,
          oldValues: log.oldValues ? JSON.parse(log.oldValues as string) : null,
          newValues: log.newValues ? JSON.parse(log.newValues as string) : null,
        }));
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على سجل الاعتمادات",
        });
      }
    }),
});
