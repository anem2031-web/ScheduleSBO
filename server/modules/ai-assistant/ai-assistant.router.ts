import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { workers, incentives, schedules, attendance, evaluations } from "../../../drizzle/schema";
import { eq, and, gte, lte, sum, avg, count } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../../_core/llm";

/**
 * router مساعد الذكاء الاصطناعي
 * يوفر تحليلات ذكية وإجابات على الاستفسارات
 */
export const aiAssistantRouter = router({
  /**
   * معالجة رسالة من المستخدم والحصول على رد من الذكاء الاصطناعي
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      context: z.object({
        department: z.string().optional(),
        period: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // جمع البيانات الأساسية للسياق
        const workersCount = await db.select({ count: count() }).from(workers);
        const incentivesData = await db
          .select({ 
            total: sum(incentives.totalAmount),
            avg: avg(incentives.totalAmount),
            count: count()
          })
          .from(incentives)
          .where(eq(incentives.status, "approved"));

        // بناء السياق للـ LLM
        const systemPrompt = `أنت مساعد ذكي متخصص في إدارة القوى العاملة. 
لديك معلومات عن النظام:
- عدد العمال: ${workersCount[0]?.count || 0}
- إجمالي الحوافز المعتمدة: ${incentivesData[0]?.total || 0} ريال سعودي
- متوسط الحافز: ${incentivesData[0]?.avg || 0} ريال سعودي

يجب أن تجيب على الأسئلة بطريقة احترافية وتقدم تحليلات دقيقة.`;

        // استدعاء LLM
        const response = await invokeLLM({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.message },
          ],
          max_tokens: 1000,
        });

        // استخراج النص من الرد
        const assistantMessage = response.choices[0]?.message?.content || "";

        // تسجيل السؤال والإجابة
        await createAuditLog(
          "ai_assistant",
          0,
          "create",
          ctx.user?.id || 0,
          undefined,
          {
            question: input.message,
            response: assistantMessage,
          }
        );

        return {
          success: true,
          response: assistantMessage,
          timestamp: new Date(),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على رد من المساعد الذكي",
        });
      }
    }),

  /**
   * تحليل أداء العمال
   */
  analyzePerformance: protectedProcedure
    .input(z.object({
      departmentId: z.number().optional(),
      period: z.enum(["week", "month", "quarter", "year"]),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // حساب الفترة الزمنية
        const now = new Date();
        let startDate = new Date();
        
        switch (input.period) {
          case "week":
            startDate.setDate(now.getDate() - 7);
            break;
          case "month":
            startDate.setMonth(now.getMonth() - 1);
            break;
          case "quarter":
            startDate.setMonth(now.getMonth() - 3);
            break;
          case "year":
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        }

        // جلب بيانات التقييمات
        const performanceData = await db
          .select({
            workerId: evaluations.workerId,
            avgScore: avg(evaluations.totalScore),
            count: count(),
          })
          .from(evaluations)
          .where(
            and(
              gte(evaluations.evaluationDate, startDate),
              lte(evaluations.evaluationDate, now)
            )
          )
          .groupBy(evaluations.workerId);

        // توليد تحليل بواسطة LLM
        const analysisPrompt = `قم بتحليل بيانات الأداء التالية وقدم ملخصاً:
${JSON.stringify(performanceData, null, 2)}

يرجى تقديم:
1. ملخص الأداء العام
2. أفضل الأداء
3. المناطق التي تحتاج تحسين
4. التوصيات`;

        const analysis = await invokeLLM({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: analysisPrompt },
          ],
          max_tokens: 1500,
        });

        const analysisText = analysis.choices[0]?.message?.content || "";

        return {
          period: input.period,
          data: performanceData,
          analysis: analysisText,
          timestamp: new Date(),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحليل الأداء",
        });
      }
    }),

  /**
   * توليد توصيات تحسين الأداء
   */
  generateRecommendations: protectedProcedure
    .input(z.object({
      workerId: z.number().optional(),
      departmentId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // جلب البيانات ذات الصلة
        const workerData = input.workerId
          ? await db.select().from(workers).where(eq(workers.id, input.workerId)).limit(1)
          : await db.select().from(workers).limit(10);

        // توليد التوصيات بواسطة LLM
        const recommendationPrompt = `بناءً على بيانات العمال التالية:
${JSON.stringify(workerData, null, 2)}

قم بتوليد توصيات محددة لتحسين الأداء:
1. نقاط القوة
2. مجالات التحسين
3. خطط العمل المقترحة
4. مؤشرات الأداء الرئيسية (KPIs)`;

        const recommendations = await invokeLLM({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: recommendationPrompt },
          ],
          max_tokens: 2000,
        });

        const recommendationsText = recommendations.choices[0]?.message?.content || "";

        return {
          recommendations: recommendationsText,
          timestamp: new Date(),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل توليد التوصيات",
        });
      }
    }),

  /**
   * توليد تقرير شامل
   */
  generateReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(["performance", "attendance", "incentives", "comprehensive"]),
      period: z.enum(["week", "month", "quarter", "year"]),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // جمع البيانات حسب نوع التقرير
        let reportData: Record<string, unknown> = {};

        if (input.reportType === "performance" || input.reportType === "comprehensive") {
          const performanceData = await db
            .select({ count: count(), avg: avg(evaluations.totalScore) })
            .from(evaluations);
          reportData = { ...reportData, performance: performanceData };
        }

        if (input.reportType === "attendance" || input.reportType === "comprehensive") {
          const attendanceData = await db
            .select({ count: count() })
            .from(attendance);
          reportData = { ...reportData, attendance: attendanceData };
        }

        if (input.reportType === "incentives" || input.reportType === "comprehensive") {
          const incentivesData = await db
            .select({ total: sum(incentives.totalAmount), count: count() })
            .from(incentives);
          reportData = { ...reportData, incentives: incentivesData };
        }

        // توليد التقرير بواسطة LLM
        const reportPrompt = `قم بتوليد تقرير ${input.reportType} شامل للفترة ${input.period}:
${JSON.stringify(reportData, null, 2)}

يجب أن يتضمن التقرير:
1. ملخص تنفيذي
2. البيانات والإحصائيات
3. التحليل والتقييم
4. التوصيات والخطوات التالية
5. الخلاصة`;

        const report = await invokeLLM({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: reportPrompt },
          ],
          max_tokens: 3000,
        });

        const reportText = report.choices[0]?.message?.content || "";

        // تسجيل التقرير
        await createAuditLog(
          "report",
          0,
          "create",
          ctx.user?.id || 0,
          undefined,
          {
            reportType: input.reportType,
            period: input.period,
          }
        );

        return {
          success: true,
          report: reportText,
          reportType: input.reportType,
          period: input.period,
          generatedAt: new Date(),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل توليد التقرير",
        });
      }
    }),

  /**
   * الحصول على رؤى ذكية
   */
  getInsights: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // جلب البيانات الأساسية
        const workersCount = await db.select({ count: count() }).from(workers);
        const avgPerformance = await db
          .select({ avg: avg(evaluations.totalScore) })
          .from(evaluations);
        const totalIncentives = await db
          .select({ total: sum(incentives.totalAmount) })
          .from(incentives)
          .where(eq(incentives.status, "approved"));

        // توليد الرؤى بواسطة LLM
        const insightsPrompt = `بناءً على البيانات التالية:
- عدد العمال: ${workersCount[0]?.count || 0}
- متوسط الأداء: ${avgPerformance[0]?.avg || 0}
- إجمالي الحوافز: ${totalIncentives[0]?.total || 0}

قم بتوليد 5 رؤى ذكية قابلة للتنفيذ لتحسين الأداء التنظيمي.`;

        const insights = await invokeLLM({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: insightsPrompt },
          ],
          max_tokens: 1500,
        });

        const insightsText = insights.choices[0]?.message?.content || "";

        return {
          insights: insightsText,
          timestamp: new Date(),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على الرؤى",
        });
      }
    }),
});
