import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { eq } from "drizzle-orm";
import { incentives, overtimes } from "../../../drizzle/schema";

/**
 * ============================================================================
 * Incentives Router - محرك الحوافز والمكافآت
 * ============================================================================
 */

export const incentivesRouter = router({
  /**
   * إنشاء حافزة جديدة
   */
  createIncentive: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        categoryId: z.number(),
        amount: z.number().positive(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.INCENTIVE_READ)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لإنشاء الحوافز",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.insert(incentives).values({
          workerId: input.workerId,
          categoryId: input.categoryId,
          periodStart: new Date(),
          periodEnd: new Date(),
          baseAmount: input.amount.toString(),
          totalAmount: input.amount.toString(),
          status: "calculated",
          calculatedBy: ctx.user.id,
          calculatedAt: new Date(),
        });

        // تسجيل التدقيق
        // سيتم تسجيل العملية لاحقاً عند الحصول على معرف الحافزة المُنشأة

        return { success: true, message: "تم إنشاء الحافزة بنجاح" };
      } catch (error) {
        console.error("Error creating incentive:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء إنشاء الحافزة",
        });
      }
    }),

  /**
   * اعتماد الحافزة - المرحلة الأولى
   */
  approveIncentiveHR: protectedProcedure
    .input(
      z.object({
        incentiveId: z.number(),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.INCENTIVE_APPROVE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لاعتماد الحوافز",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newStatus = input.approved ? "calculated" : "rejected";

        await db
          .update(incentives)
          .set({
            status: newStatus,
          })
          .where(eq(incentives.id, input.incentiveId));

        await createAuditLog(
          "incentives",
          input.incentiveId,
          input.approved ? "approve" : "reject",
          ctx.user.id,
          { status: "calculated" },
          { status: newStatus },
          `تم ${input.approved ? "اعتماد" : "رفض"} الحافزة من الشؤون الإدارية`
        );

        return { success: true, message: "تم معالجة الحافزة بنجاح" };
      } catch (error) {
        console.error("Error approving incentive:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء اعتماد الحافزة",
        });
      }
    }),

  /**
   * اعتماد الحافزة - المرحلة الثانية
   */
  approveIncentiveReviewer: protectedProcedure
    .input(
      z.object({
        incentiveId: z.number(),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.INCENTIVE_APPROVE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لاعتماد الحوافز",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newStatus = input.approved ? "approved" : "rejected";

        await db
          .update(incentives)
          .set({
            status: newStatus,
          })
          .where(eq(incentives.id, input.incentiveId));

        await createAuditLog(
          "incentives",
          input.incentiveId,
          input.approved ? "approve" : "reject",
          ctx.user.id,
          { status: "calculated" },
          { status: newStatus },
          `تم ${input.approved ? "اعتماد" : "رفض"} الحافزة من المراجعة المالية`
        );

        return { success: true, message: "تم معالجة الحافزة بنجاح" };
      } catch (error) {
        console.error("Error approving incentive:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء اعتماد الحافزة",
        });
      }
    }),

  /**
   * اعتماد الحافزة - المرحلة الثالثة
   */
  approveIncentiveHead: protectedProcedure
    .input(
      z.object({
        incentiveId: z.number(),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.INCENTIVE_APPROVE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لاعتماد الحوافز",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newStatus = input.approved ? "paid" : "rejected";

        await db
          .update(incentives)
          .set({
            status: newStatus,
          })
          .where(eq(incentives.id, input.incentiveId));

        await createAuditLog(
          "incentives",
          input.incentiveId,
          input.approved ? "approve" : "reject",
          ctx.user.id,
          { status: "approved" },
          { status: newStatus },
          `تم ${input.approved ? "اعتماد" : "رفض"} الحافزة من رئيس الحسابات`
        );

        return { success: true, message: "تم معالجة الحافزة بنجاح" };
      } catch (error) {
        console.error("Error approving incentive:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء اعتماد الحافزة",
        });
      }
    }),

  /**
   * الحصول على الحوافز المعلقة
   */
  getPendingIncentives: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db.select().from(incentives).where(eq(incentives.status, "calculated"));
  }),

  /**
   * إضافة دوام إضافي
   */
  createOvertime: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        date: z.date(),
        hours: z.number().positive(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.INCENTIVE_READ)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لإضافة دوام إضافي",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const totalAmount = (input.hours * 1.5).toString();

        await db.insert(overtimes).values({
          workerId: input.workerId,
          overtimeDate: input.date,
          hours: input.hours.toString(),
          totalAmount: totalAmount,
          reasonId: 1,
          hourlyRate: "0",
          status: "pending",
        });

        // تسجيل التدقيق
        // سيتم تسجيل العملية لاحقاً

        return {
          success: true,
          message: "تم إضافة الدوام الإضافي بنجاح",
          totalAmount: totalAmount,
        };
      } catch (error) {
        console.error("Error creating overtime:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء إضافة الدوام الإضافي",
        });
      }
    }),

  /**
   * الحصول على الحوافز للعامل
   */
  getWorkerIncentives: protectedProcedure
    .input(z.object({ workerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      return db.select().from(incentives).where(eq(incentives.workerId, input.workerId));
    }),

  /**
   * حساب إجمالي المستحقات
   */
  calculateWorkerTotal: protectedProcedure
    .input(z.object({ workerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const approvedIncentives = await db
        .select()
        .from(incentives)
        .where(eq(incentives.workerId, input.workerId));

      const totalIncentives = approvedIncentives.reduce(
        (sum, inc) => sum + parseFloat(inc.totalAmount),
        0
      );

      return {
        workerId: input.workerId,
        totalIncentives: totalIncentives.toFixed(2),
        count: approvedIncentives.length,
      };
    }),
});
