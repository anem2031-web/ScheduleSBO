import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { eq, and, gte, lte } from "drizzle-orm";
import { evaluations } from "../../../drizzle/schema";

/**
 * ============================================================================
 * Evaluations Router - محرك التقييم
 * ============================================================================
 */

export const evaluationsRouter = router({
  /**
   * إنشاء تقييم جديد
   */
  createEvaluation: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        templateId: z.number(),
        evaluationType: z.enum(["daily", "weekly", "monthly"]),
        evaluationDate: z.date(),
        totalScore: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.EVALUATION_CREATE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لإنشاء التقييمات",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const result = await db.insert(evaluations).values({
          workerId: input.workerId,
          templateId: input.templateId,
          evaluationType: input.evaluationType,
          evaluationDate: input.evaluationDate,
          totalScore: input.totalScore,
          notes: input.notes || "",
          scores: JSON.stringify({}),
          evaluatedBy: ctx.user.id,
          status: "draft",
        });

        await createAuditLog(
          "evaluations",
          1,
          "create",
          ctx.user.id,
          undefined,
          input,
          `تم إنشاء تقييم ${input.evaluationType}`
        );

        return { success: true, message: "تم إنشاء التقييم بنجاح" };
      } catch (error) {
        console.error("Error creating evaluation:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء إنشاء التقييم",
        });
      }
    }),

  /**
   * الموافقة على التقييم
   */
  approveEvaluation: protectedProcedure
    .input(
      z.object({
        evaluationId: z.number(),
        approved: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.EVALUATION_APPROVE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لاعتماد التقييمات",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newStatus = input.approved ? "approved" : "rejected";

        await db
          .update(evaluations)
          .set({
            status: newStatus,
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(evaluations.id, input.evaluationId));

        await createAuditLog(
          "evaluations",
          input.evaluationId,
          input.approved ? "approve" : "reject",
          ctx.user.id,
          { status: "submitted" },
          { status: newStatus },
          input.notes || `تم ${input.approved ? "اعتماد" : "رفض"} التقييم`
        );

        return {
          success: true,
          message: `تم ${input.approved ? "اعتماد" : "رفض"} التقييم بنجاح`,
        };
      } catch (error) {
        console.error("Error approving evaluation:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء اعتماد التقييم",
        });
      }
    }),

  /**
   * الحصول على تقييمات العامل
   */
  getWorkerEvaluations: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        evaluationType: z.enum(["daily", "weekly", "monthly"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.EVALUATION_READ)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لعرض التقييمات",
        });
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions: any[] = [eq(evaluations.workerId, input.workerId)];

      if (input.evaluationType) {
        conditions.push(eq(evaluations.evaluationType, input.evaluationType));
      }

      if (input.startDate && input.endDate) {
        conditions.push(gte(evaluations.evaluationDate, input.startDate));
        conditions.push(lte(evaluations.evaluationDate, input.endDate));
      }

      return db
        .select()
        .from(evaluations)
        .where(and(...conditions));
    }),

  /**
   * الحصول على التقييمات المعلقة
   */
  getPendingEvaluations: protectedProcedure.query(async ({ ctx }) => {
    if (!rbac.hasPermission(ctx.user, rbac.EVALUATION_APPROVE)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "ليس لديك صلاحية لعرض التقييمات المعلقة",
      });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(evaluations)
      .where(eq(evaluations.status, "submitted"));
  }),

  /**
   * إرسال التقييم للاعتماد
   */
  submitEvaluation: protectedProcedure
    .input(z.object({ evaluationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(evaluations)
        .set({ status: "submitted" })
        .where(eq(evaluations.id, input.evaluationId));

      await createAuditLog(
        "evaluations",
        input.evaluationId,
        "update",
        ctx.user.id,
        { status: "draft" },
        { status: "submitted" },
        "تم إرسال التقييم للاعتماد"
      );

      return { success: true, message: "تم إرسال التقييم للاعتماد" };
    }),
});
