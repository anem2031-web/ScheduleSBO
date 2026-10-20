import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../../_core/trpc";
import { createAuditLog } from "../../shared/audit";
import * as rbac from "../../shared/rbac";
import * as db from "./workers.repository";
import { revisedDailyLimit } from "./work-budget";
import { assertWorkerInScope, assertCostCenterScope, getScopedWorkerIds } from "../../shared/worker-scope";
import {
  createWorkerSchema,
  updateWorkerSchema,
  workerStatusSchema,
  workerDutySettingsSchema,
} from "./workers.validation";

function requireWorkerRead(user: rbac.AuthorizedUser) {
  if (user.role === "worker" && rbac.hasPermission(user, "workers:read:self")) return;
  rbac.requirePermission(user, "workers:read");
}

function handleDatabaseError(error: unknown): never {
  const mysqlError = error as {
    code?: string;
    sqlMessage?: string;
    message?: string;
  };

  if (mysqlError.code === "ER_DUP_ENTRY") {
    const text = mysqlError.sqlMessage ?? mysqlError.message ?? "";

    if (text.includes("employeeId")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "الرقم الوظيفي مستخدم لعامل آخر",
      });
    }

    if (text.includes("fingerprintId")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "رقم البصمة مستخدم لعامل آخر",
      });
    }

    throw new TRPCError({
      code: "CONFLICT",
      message: "توجد قيمة مكررة غير مسموح بها",
    });
  }

  if ((error as Error)?.message === "DATABASE_NOT_AVAILABLE") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "قاعدة البيانات غير متاحة",
    });
  }

  throw error;
}

/**
 * يحول التاريخ القادم من النموذج بصيغة YYYY-MM-DD
 * إلى Date صالح للحفظ في قاعدة البيانات.
 */
function parseHireDate(value: string): Date {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "تاريخ التعيين غير صالح",
    });
  }

  return date;
}

async function validateReferences(input: {
  departmentId?: number;
  jobTitleId?: number;
  primarySupervisorId?: number;
}) {
  if (input.departmentId !== undefined) {
    const department = await db.getDepartmentById(input.departmentId);

    if (!department || !department.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "القسم المحدد غير موجود أو غير نشط",
      });
    }
  }

  if (input.jobTitleId !== undefined) {
    const jobTitle = await db.getJobTitleById(input.jobTitleId);

    if (!jobTitle || !jobTitle.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "المسمى الوظيفي غير موجود أو غير نشط",
      });
    }

    if (
      input.departmentId !== undefined &&
      jobTitle.departmentId &&
      jobTitle.departmentId !== input.departmentId
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "المسمى الوظيفي لا يتبع القسم المحدد",
      });
    }
  }

  if (input.primarySupervisorId !== undefined) {
    const supervisor = await db.getWorkerById(input.primarySupervisorId);

    if (!supervisor || !supervisor.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "المشرف الأساسي غير موجود أو غير نشط",
      });
    }
  }
}

export const workersRouter = router({
  updateDutySettings: protectedProcedure
    .input(workerDutySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      rbac.requirePermission(ctx.user as any, "workers:update");
      await assertWorkerInScope(ctx.user, input.workerId);
      await assertCostCenterScope(ctx.user, input.branch);
      const worker = await db.getWorkerById(input.workerId);
      if (!worker)
        throw new TRPCError({ code: "NOT_FOUND", message: "العامل غير موجود" });
      const previous = await db.getDutySettings(input.workerId);
      const maxDailyHours = revisedDailyLimit(
        previous ? Number(previous.requiredHoursPerDay) : null,
        previous ? Number(previous.maxDailyHours) : null,
        input.requiredDailyHours,
      );
      if (maxDailyHours === null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `الساعات المطلوبة تتجاوز الحد الأقصى المسجل للعامل (${previous!.maxDailyHours} ساعة). راجع الحد الأقصى قبل زيادة الساعات المطلوبة.`,
        });
      if (input.branch && input.branch !== previous?.branch) {
        const branch = await db.getBranchByCode(input.branch);
        if (!branch?.isActive)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "اختر مركز تكلفة نشطًا من القائمة",
          });
      }
      const saved = await db.saveDutySettings(
        input.workerId,
        input,
        maxDailyHours,
      );
      await createAuditLog(
        "worker_card",
        input.workerId,
        previous ? "update" : "create",
        ctx.user.id,
        previous as any,
        saved as any,
      );
      return saved;
    }),
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(100).optional(),

          departmentId: z.number().int().positive().optional(),

          jobTitleId: z.number().int().positive().optional(),

          status: workerStatusSchema.optional(),

          isActive: z.boolean().optional(),

          page: z.number().int().min(1).default(1),

          pageSize: z.number().int().min(1).max(100).default(20),
        })
        .default({
          page: 1,
          pageSize: 20,
        }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerRead(ctx.user);

      return db.listWorkers({
        ...input,
        workerIds: await getScopedWorkerIds(ctx.user),
        supervisorUserId:
          ctx.user.role === "supervisor" ? ctx.user.id : undefined,
      });
    }),

  listAll: protectedProcedure.query(async ({ ctx }) => {
    requireWorkerRead(ctx.user);

    return db.getAllActiveWorkers(
      ctx.user.role === "supervisor" ? ctx.user.id : undefined,
      await getScopedWorkerIds(ctx.user),
    );
  }),

  referenceData: protectedProcedure.query(async ({ ctx }) => {
    requireWorkerRead(ctx.user);

    const [departments, supervisors, locations] = await Promise.all([
      db.getAllDepartments(),
      db.getAllActiveWorkers(
        ctx.user.role === "supervisor" ? ctx.user.id : undefined,
        await getScopedWorkerIds(ctx.user),
      ),
      db.getAllLocations(),
    ]);

    return {
      departments,
      supervisors,
      locations,
    };
  }),

  jobTitlesByDepartment: protectedProcedure
    .input(
      z.object({
        departmentId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerRead(ctx.user);

      return db.getJobTitlesByDepartment(input.departmentId);
    }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerRead(ctx.user);

      const worker = await db.getWorkerById(
        input.id,
        ctx.user.role === "supervisor" ? ctx.user.id : undefined,
      );
      if (worker) await assertWorkerInScope(ctx.user, worker.id);

      if (!worker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "العامل غير موجود",
        });
      }

      return worker;
    }),

  getByEmployeeId: protectedProcedure
    .input(
      z.object({
        employeeId: z.string().trim().min(1).max(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerRead(ctx.user);

      const worker = await db.getWorkerByEmployeeId(
        input.employeeId.toUpperCase(),
        ctx.user.role === "supervisor" ? ctx.user.id : undefined,
      );
      if (worker) await assertWorkerInScope(ctx.user, worker.id);

      if (!worker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "العامل غير موجود",
        });
      }

      return worker;
    }),

  create: protectedProcedure
    .input(createWorkerSchema)
    .mutation(async ({ ctx, input }) => {
      rbac.requirePermission(ctx.user as any, "workers:create");

      await validateReferences(input);
      const availableCenters = input.locationId ? await db.locationCenters(input.locationId, input.departmentId) : [];
      if (input.locationId && !availableCenters.length) throw new TRPCError({code:"BAD_REQUEST",message:"الموقع غير نشط أو لا يرتبط بالقسم المختار"});
      const selectedCenter = availableCenters.find(center => !ctx.user.accessScope || ctx.user.accessScope.costCenterIds.includes(center.id));
      await assertCostCenterScope(ctx.user, selectedCenter?.code);

      const employeeId = input.employeeId.trim().toUpperCase();

      const existingWorker = await db.getWorkerByEmployeeId(employeeId);

      if (existingWorker) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "الرقم الوظيفي مستخدم لعامل آخر",
        });
      }

      if (input.fingerprintId) {
        const fingerprintWorker = await db.getWorkerByFingerprintId(
          input.fingerprintId,
        );

        if (fingerprintWorker) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "رقم البصمة مستخدم لعامل آخر",
          });
        }
      }

      try {
        const worker = await db.insertWorker({
          ...input,
          employeeId,
          hireDate: input.hireDate ? parseHireDate(input.hireDate) : null,
          isActive:
            input.status !== "terminated" && input.status !== "inactive",
        });

        if (!worker) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "تعذر إنشاء العامل",
          });
        }
        if (selectedCenter) await db.saveDutySettings(worker.id, {requiredDailyHours:9,weeklyRestDay:5,branch:selectedCenter.code}, 9);

        await createAuditLog(
          "worker",
          worker.id,
          "create",
          ctx.user.id,
          undefined,
          worker as any,
        );

        return worker;
      } catch (error) {
        return handleDatabaseError(error);
      }
    }),

  update: protectedProcedure
    .input(updateWorkerSchema)
    .mutation(async ({ ctx, input }) => {
      rbac.requirePermission(ctx.user as any, "workers:update");

      const current = await db.getWorkerById(input.id);
      await assertWorkerInScope(ctx.user, input.id);

      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "العامل غير موجود",
        });
      }

      const { id, hireDate, ...rawChanges } = input;

      /*
       * لا نضيف hireDate إلى التحديث إلا إذا
       * أُرسل فعلًا، ثم نحوله إلى Date.
       */
      const changes = {
        ...rawChanges,
        ...(hireDate !== undefined
          ? {
              hireDate: hireDate ? parseHireDate(hireDate) : null,
            }
          : {}),
      };

      const departmentId = changes.departmentId ?? current.departmentId;

      const jobTitleId = changes.jobTitleId ?? current.jobTitleId;
      const targetLocation = changes.locationId === undefined ? current.locationId : changes.locationId;
      let targetCenterCode: string | undefined;
      if (targetLocation && (changes.locationId !== undefined || changes.departmentId !== undefined)) {
        const centers = await db.locationCenters(targetLocation, departmentId);
        if (!centers.length) throw new TRPCError({code:"BAD_REQUEST",message:"الموقع لا يرتبط بالقسم المختار"});
        const center = centers.find(row=>!ctx.user.accessScope || ctx.user.accessScope.costCenterIds.includes(row.id));
        await assertCostCenterScope(ctx.user, center?.code);
        targetCenterCode = center?.code;
      }

      await validateReferences({
        departmentId,
        jobTitleId,
        primarySupervisorId: changes.primarySupervisorId,
      });

      if (changes.primarySupervisorId === id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يمكن تعيين العامل مشرفًا على نفسه",
        });
      }

      if (changes.fingerprintId) {
        const duplicate = await db.getWorkerByFingerprintId(
          changes.fingerprintId,
        );

        if (duplicate && duplicate.id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "رقم البصمة مستخدم لعامل آخر",
          });
        }
      }

      try {
        const updated = await db.updateWorker(id, changes, targetCenterCode);

        await createAuditLog(
          "worker",
          id,
          "update",
          ctx.user.id,
          current as any,
          updated as any,
        );

        return updated;
      } catch (error) {
        return handleDatabaseError(error);
      }
    }),

  changeStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),

        status: workerStatusSchema,

        reason: z.string().trim().min(3, "سبب تغيير الحالة مطلوب").max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rbac.requirePermission(ctx.user as any, "workers:update");

      const current = await db.getWorkerById(input.id);
      await assertWorkerInScope(ctx.user, input.id);

      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "العامل غير موجود",
        });
      }

      const updated = await db.updateWorker(input.id, {
        status: input.status,
        isActive: input.status === "active" || input.status === "on_leave",
      });

      await createAuditLog(
        "worker",
        input.id,
        "update",
        ctx.user.id,
        {
          status: current.status,
          isActive: current.isActive,
        },
        {
          status: updated?.status,
          isActive: updated?.isActive,
        },
        input.reason,
      );

      return updated;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),

        reason: z.string().trim().min(3).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rbac.requirePermission(ctx.user as any, "workers:delete");

      const current = await db.getWorkerById(input.id);
      await assertWorkerInScope(ctx.user, input.id);

      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "العامل غير موجود",
        });
      }

      const updated = await db.updateWorker(input.id, {
        status: "terminated",
        isActive: false,
      });

      await createAuditLog(
        "worker",
        input.id,
        "update",
        ctx.user.id,
        {
          status: current.status,
          isActive: current.isActive,
        },
        {
          status: "terminated",
          isActive: false,
        },
        input.reason,
      );

      return {
        success: true,
        worker: updated,
      };
    }),
});
