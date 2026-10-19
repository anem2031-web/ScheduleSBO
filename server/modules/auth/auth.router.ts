import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE, USERNAME_PATTERN } from "../../../shared/access-control";
import { getSessionCookieOptions } from "../../_core/cookies";
import { protectedProcedure, publicProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import * as service from "./auth.service";
import { AuthError, SESSION_MAX_AGE_MS } from "./auth.service";

/**
 * ============================================================================
 * Auth Router — مصادقة محلية (بدون أي مزوّد خارجي)
 * ----------------------------------------------------------------------------
 * login    → عام: يتحقق ويضبط كوكي الجلسة httpOnly
 * me       → عام: يرجع المستخدم الحالي (من context) أو null
 * logout   → عام: يمسح كوكي الجلسة
 * register → محمي بصلاحية USERS_CREATE: إنشاء حسابات (لا يوجد تسجيل ذاتي مفتوح)
 * ============================================================================
 */

/** لا نرجع passwordHash للعميل أبدًا */
function toSafeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

function toTrpcError(error: unknown, fallbackMessage: string): never {
  if (error instanceof AuthError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof TRPCError) throw error;
  console.error(fallbackMessage, error);
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: fallbackMessage });
}

export const authRouter = router({
  /** المستخدم الحالي من الجلسة (null إن لم يكن مسجّلًا) */
  me: publicProcedure.query((opts) =>
    opts.ctx.user ? toSafeUser(opts.ctx.user) : null
  ),

  /** تسجيل الدخول بالبريد وكلمة المرور */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().trim().min(2, "أدخل اسم الدخول أو البريد الإلكتروني").max(320),
        password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, sessionToken } = await service.loginUser(
          input.email.trim().toLowerCase(),
          input.password
        );

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: SESSION_MAX_AGE_MS,
        });

        return { success: true, user: toSafeUser(user) } as const;
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء تسجيل الدخول");
      }
    }),

  /** تسجيل الخروج — مسح كوكي الجلسة */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return {
      success: true,
    } as const;
  }),

  /** إنشاء مستخدم جديد — للمسؤولين فقط (لا تسجيل ذاتي) */
  register: protectedProcedure
    .input(
      z.object({
        email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
        username: z.string().trim().regex(USERNAME_PATTERN, "اسم الدخول من 2 إلى 64 خانة؛ حروف إنجليزية وأرقام و _ . -").optional(),
        password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE),
        name: z.string().min(2, "الاسم مطلوب"),
        role: z
          .enum([
            "admin",
            "hr_admin",
            "supervisor",
            "guard",
            "worker",
            "financial_reviewer",
            "finance",
            "accounting_head",
            "modifier",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.USERS_CREATE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لإنشاء مستخدمين",
        });
      }
      if (ctx.user.role !== "admin" && input.role && !["worker", "supervisor"].includes(input.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء حساب بصلاحيات إدارية متاح لمسؤول النظام فقط" });
      }

      try {
        const user = await service.registerUser({
          email: input.email.trim().toLowerCase(),
          username: input.username,
          password: input.password,
          name: input.name,
          role: input.role,
        });
        return { success: true, user: toSafeUser(user) } as const;
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء إنشاء المستخدم");
      }
    }),
});
