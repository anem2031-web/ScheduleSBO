import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { incentiveRules, workers, incentives, evaluations } from "../../../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * router الحوافز المتقدم
 * يدير حوافز كل قسم مع قواعد وشروط محددة
 */
export const advancedIncentivesRouter = router({
  /**
   * حساب الحوافز بناءً على قواعد القسم والتقييمات
   */
  calculateIncentives: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        month: z.string(),
        department: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // الحصول على بيانات العامل
        const worker = await db
          .select()
          .from(workers)
          .where(eq(workers.id, input.workerId))
          .limit(1);

        if (worker.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "العامل غير موجود" });
        }

        // الحصول على قواعس الحوافز
        const rules = await db
          .select()
          .from(incentiveRules);

        if (rules.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "لا توجد قواعد حوافز",
          });
        }

        // الحصول على التقييمات
        const evals = await db
          .select()
          .from(evaluations)
          .where(
            eq(evaluations.workerId, input.workerId)
          );

        // حساب الحافز بناءً على التقييمات والقواعس
        let totalIncentive = 0;
        const breakdown: Record<string, number> = {};

        for (const rule of rules) {
          if (evals.length > 0) {
            // حساب الحافز بناءً على معايير التقييم
            const scores = evals.map(e => {
              const s = typeof e.scores === 'string' ? JSON.parse(e.scores) : e.scores;
              return typeof s === 'number' ? s : parseFloat(e.totalScore) || 0;
            });
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

            if (avgScore >= 0) {
              const ruleDefinition = typeof rule.ruleDefinition === 'string' 
                ? JSON.parse(rule.ruleDefinition) 
                : rule.ruleDefinition;
              const incentiveAmount = ruleDefinition?.amount || 0;
              totalIncentive += incentiveAmount;
              breakdown[rule.ruleCode] = incentiveAmount;
            }
          }
        }

        return {
          workerId: input.workerId,
          workerName: worker[0].nameAr || worker[0].nameEn || '',
          month: input.month,
          totalIncentive,
          breakdown,
          evaluationCount: evals.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل حساب الحوافز",
        });
      }
    }),

  /**
   * الحصول على قواعس الحوافز للقسم
   */
  getIncentiveRules: protectedProcedure
    .input(z.object({ department: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const rules = await db
          .select()
          .from(incentiveRules);

        return rules;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على قواعس الحوافز",
        });
      }
    }),

  /**
   * تحديث قاعدة حافز
   */
  updateIncentiveRule: protectedProcedure
    .input(
      z.object({
        ruleId: z.number(),
        criteria: z.string().optional(),
        amount: z.number().optional(),
        minScore: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // التحقق من الصلاحيات
      if (!["admin", "hr_admin"].includes(ctx.user?.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      try {
        const updates: Record<string, unknown> = {};
        if (input.criteria !== undefined) updates.criteria = input.criteria;
        if (input.amount !== undefined) updates.amount = input.amount;
        if (input.minScore !== undefined) updates.minScore = input.minScore;

        if (Object.keys(updates).length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا توجد حقول للتحديث",
          });
        }

        // تحديث القاعدة
        // await db.update(incentiveRules).set(updates).where(eq(incentiveRules.id, input.ruleId));

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث قاعدة الحافز",
        });
      }
    }),

  /**
   * الحصول على الحوافز المعتمدة
   */
  getApprovedIncentives: protectedProcedure
    .input(z.object({ month: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const approvedIncentives = await db
          .select()
          .from(incentives)
          .where(eq(incentives.status, "approved"));

        return approvedIncentives;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على الحوافز المعتمدة",
        });
      }
    }),
});
