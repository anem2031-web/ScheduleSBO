import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../shared/db";
import { translations } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * router نظام الترجمة والتعدد اللغوي
 * يدير الترجمات لجميع الحقول القابلة للترجمة
 */
export const translationsRouter = router({
  /**
   * الحصول على الترجمات لحقل معين
   */
  getTranslations: protectedProcedure
    .input(
      z.object({
        fieldName: z.string(),
        language: z.enum(["ar", "en", "ur"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let query = db
          .select()
          .from(translations)
          .where(eq(translations.fieldName, input.fieldName));

        if (input.language) {
          query = db
            .select()
            .from(translations)
            .where(
              and(
                eq(translations.fieldName, input.fieldName),
                eq(translations.language, input.language)
              )
            );
        }

        const result = await query;
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على الترجمات",
        });
      }
    }),

  /**
   * إضافة أو تحديث ترجمة
   */
  upsertTranslation: protectedProcedure
    .input(
      z.object({
        fieldName: z.string(),
        language: z.enum(["ar", "en", "ur"]),
        value: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // التحقق من الصلاحيات
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      try {
        await db
          .insert(translations)
          .values({
            fieldName: input.fieldName,
            language: input.language,
            value: input.value,
            entityType: "field",
            entityId: 0,
          })
          .onDuplicateKeyUpdate({
            set: { value: input.value, updatedAt: new Date() },
          });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث الترجمة",
        });
      }
    }),

  /**
   * حذف ترجمة
   */
  deleteTranslation: protectedProcedure
    .input(
      z.object({
        fieldName: z.string(),
        language: z.enum(["ar", "en", "ur"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // التحقق من الصلاحيات
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      try {
        await db
          .delete(translations)
          .where(
            and(
              eq(translations.fieldName, input.fieldName),
              eq(translations.language, input.language)
            )
          );

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل حذف الترجمة",
        });
      }
    }),

  /**
   * الحصول على قائمة اللغات المدعومة
   */
  getSupportedLanguages: protectedProcedure.query(async () => {
    return [
      { code: "ar", name: "العربية" },
      { code: "en", name: "English" },
      { code: "ur", name: "اردو" },
    ];
  }),
});
