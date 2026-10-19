import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  archiveSupervisor,
  getAllUsers,
  getUserById,
  getUsersByRole,
  updateUserRole,
  updateUserStatus,
} from "./users.repository";
import { createAuditLog } from "../../shared/audit";
import * as rbac from "../../shared/rbac";
import { PERMISSION_CATALOG } from "../../../shared/access-control";
import { assignAccessRoles, getAccountRoleIds, listAccessRoles, loadUserAccess, saveAccountAccess } from "./access.repository";

/**
 * ============================================================================
 * User Management Router
 * ============================================================================
 */

/** لا نرجع passwordHash للعميل أبدًا */
function toSafeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

export const usersRouter = router({
  accessCatalog: protectedProcedure.query(({ ctx }) => {
    rbac.requirePermission(ctx.user, rbac.USERS_READ);
    return PERMISSION_CATALOG.map(([code, category, nameAr]) => ({ code, category, nameAr }));
  }),

  listAccessRoles: protectedProcedure.query(({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "إدارة الأدوار متاحة لمسؤول النظام فقط" });
    return listAccessRoles();
  }),

  accessSettings: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    if (input.userId !== ctx.user.id && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض صلاحيات حساب آخر" });
    const user = await getUserById(input.userId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
    const principal = await loadUserAccess(user);
    return { userId: user.id, permissions: rbac.effectivePermissions(principal), scope: principal.accessScope ?? null, roleIds: await getAccountRoleIds(user.id) };
  }),

  setAccess: protectedProcedure.input(z.object({
    userId: z.number().int().positive(),
    permissions: z.array(z.enum(PERMISSION_CATALOG.map(([code]) => code))).max(PERMISSION_CATALOG.length),
    scope: z.object({ costCenterIds: z.array(z.number().int().positive()).max(1000) }).nullable(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "تخصيص الصلاحيات متاح لمسؤول النظام فقط" });
    const target = await getUserById(input.userId);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
    if (target.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "حساب مسؤول النظام يحتفظ بجميع الصلاحيات ولا يقبل التقييد" });
    const before = await loadUserAccess(target);
    const next = { ...input, permissions: Array.from(new Set(input.permissions)) };
    await saveAccountAccess({ ...next, actorId: ctx.user.id });
    await createAuditLog("users", target.id, "update", ctx.user.id, { permissions: before.permissions, scope: before.accessScope }, next, "تحديث صلاحيات الحساب ونطاق مراكز التكلفة");
    return { success: true };
  }),

  assignAccessRoles: protectedProcedure.input(z.object({
    userId: z.number().int().positive(), roleIds: z.array(z.number().int().positive()).min(1),
    scope: z.object({ costCenterIds: z.array(z.number().int().positive()).max(1000) }).nullable(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "إسناد الأدوار متاح لمسؤول النظام فقط" });
    const target = await getUserById(input.userId);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
    if (target.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "حساب مسؤول النظام يحتفظ بجميع الصلاحيات" });
    const before = await getAccountRoleIds(target.id);
    await assignAccessRoles({ ...input, actorId: ctx.user.id });
    await createAuditLog("users", target.id, "update", ctx.user.id, { roleIds: before }, input, "إسناد أدوار الصلاحيات للحساب");
    return { success: true };
  }),
  /** Remove from active lists without erasing schedule, worker, and audit history. */
  archiveSupervisor: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "admin" ||
        !rbac.hasPermission(ctx.user, rbac.USERS_DELETE)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "أرشفة المشرفين متاحة لمسؤول النظام فقط",
        });
      }
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يمكنك حذف أو أرشفة حسابك الخاص",
        });
      }
      const supervisor = await getUserById(input.userId);
      if (!supervisor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "حساب المشرف غير موجود",
        });
      }
      if (supervisor.role !== "supervisor") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "هذا الإجراء مخصص لحسابات المشرفين فقط",
        });
      }
      if (!supervisor.isActive) {
        return { success: true, message: "حساب المشرف مؤرشف بالفعل" };
      }
      if (!(await archiveSupervisor(input.userId))) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "تغيرت حالة الحساب. حدّث القائمة ثم أعد المحاولة",
        });
      }
      await createAuditLog(
        "users",
        input.userId,
        "update",
        ctx.user.id,
        { isActive: true },
        { isActive: false },
        "أرشفة المشرف وإزالته من القائمة النشطة مع حفظ سجلاته وارتباطاته",
      );
      return {
        success: true,
        message: "تم حذف المشرف من القائمة النشطة وأرشفة حسابه مع حفظ سجلاته",
      };
    }),
  /**
   * الحصول على قائمة جميع المستخدمين
   * متاح فقط للمسؤولين
   */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    if (!rbac.hasPermission(ctx.user, rbac.USER_READ)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "ليس لديك صلاحية لعرض المستخدمين",
      });
    }

    const rows = await getAllUsers();
    return rows.map(toSafeUser);
  }),

  /**
   * الحصول على المستخدمين حسب الدور
   */
  listByRole: protectedProcedure
    .input(
      z.object({
        role: z.enum([
          "admin",
          "hr_admin",
          "supervisor",
          "guard",
          "worker",
          "financial_reviewer",
          "finance",
          "accounting_head",
          "modifier",
        ]),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.USER_READ)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لعرض المستخدمين",
        });
      }

      return (await getUsersByRole(input.role)).map(toSafeUser);
    }),

  /**
   * تحديث دور المستخدم
   * متاح فقط للمسؤولين
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        newRole: z.enum([
          "admin",
          "hr_admin",
          "supervisor",
          "guard",
          "worker",
          "financial_reviewer",
          "finance",
          "accounting_head",
          "modifier",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // التحقق من الصلاحيات
      if (ctx.user.role !== "admin" || !rbac.hasPermission(ctx.user, rbac.USERS_MANAGE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لتحديث أدوار المستخدمين",
        });
      }

      // The explicit assign-role permission authorizes this operation;
      // role names are validated by the enum, not by the permission list.

      // منع تغيير دور المسؤول
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يمكنك تغيير دورك الخاص",
        });
      }

      try {
        await updateUserRole(input.userId, input.newRole);

        // تسجيل العملية في سجل التدقيق
        await createAuditLog(
          "users",
          input.userId,
          "update",
          ctx.user.id,
          { role: "old_role" },
          { role: input.newRole },
          `تم تحديث الدور إلى ${input.newRole}`,
        );

        return { success: true, message: "تم تحديث الدور بنجاح" };
      } catch (error) {
        console.error("Error updating user role:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء تحديث الدور",
        });
      }
    }),

  /**
   * تفعيل أو تعطيل المستخدم
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // التحقق من الصلاحيات
      if (!rbac.hasPermission(ctx.user, "users:update")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لتحديث حالة المستخدمين",
        });
      }

      // منع تعطيل المستخدم نفسه
      if (input.userId === ctx.user.id && !input.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يمكنك تعطيل حسابك الخاص",
        });
      }
      const target = await getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (target.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعطيل حساب مسؤول النظام من هذا الإجراء" });

      try {
        await updateUserStatus(input.userId, input.isActive);

        // تسجيل العملية في سجل التدقيق
        await createAuditLog(
          "users",
          input.userId,
          "update",
          ctx.user.id,
          { isActive: !input.isActive },
          { isActive: input.isActive },
          `تم ${input.isActive ? "تفعيل" : "تعطيل"} المستخدم`,
        );

        return {
          success: true,
          message: `تم ${input.isActive ? "تفعيل" : "تعطيل"} المستخدم بنجاح`,
        };
      } catch (error) {
        console.error("Error updating user status:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء تحديث حالة المستخدم",
        });
      }
    }),

  /**
   * الحصول على معلومات المستخدم الحالي
   */
  getCurrentUser: protectedProcedure.query(({ ctx }) => {
    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      username: ctx.user.username,
      permissions: rbac.effectivePermissions(ctx.user),
      accessScope: ctx.user.accessScope ?? null,
      isActive: ctx.user.isActive,
    };
  }),

  /**
   * الحصول على صلاحيات المستخدم الحالي
   */
  getMyPermissions: protectedProcedure.query(({ ctx }) => {
    return rbac.effectivePermissions(ctx.user);
  }),
});
