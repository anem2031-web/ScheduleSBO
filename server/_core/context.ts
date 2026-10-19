import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AuthorizedUser } from "../shared/rbac";
// [LOCAL AUTH] استُبدلت مصادقة Manus (sdk.authenticateRequest) بالمصادقة المحلية.
// انظر: server/modules/auth/auth.service.ts — هذا هو التعديل الوحيد في هذا الملف.
import { authenticateRequest } from "../modules/auth/auth.service";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthorizedUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AuthorizedUser | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures, لكن نسجّل السبب
    // الحقيقي — قد يكون فشل اتصال بقاعدة البيانات (مثل ECONNRESET) وليس
    // بالضرورة جلسة منتهية أو توكن غير صالح، والفرق مهم للتشخيص.
    console.error(
      "[Auth] فشل التحقق من الجلسة — يُعامَل المستخدم كغير مسجّل دخول:",
      error
    );
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
