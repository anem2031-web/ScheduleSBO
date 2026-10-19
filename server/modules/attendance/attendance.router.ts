import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import * as service from "./attendance.service";
import { AttendanceError } from "./attendance.service";
import { assertWorkerInScope, getScopedWorkerIds } from "../../shared/worker-scope";
import * as repo from "./attendance.repository";

/**
 * ============================================================================
 * Attendance Router — طبقة رفيعة: Validation + صلاحيات + استدعاء الـ Service
 * ----------------------------------------------------------------------------
 * لا تكتب منطق عمل أو SQL هنا. المنطق في attendance.service.ts
 * والاستعلامات في attendance.repository.ts
 * ============================================================================
 */

function requirePermission(role: Parameters<typeof rbac.hasPermission>[0], permission: string, message: string) {
  if (!rbac.hasPermission(role, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

/** يسمح للعامل برؤية سجلاته فقط، وللمسؤولين برؤية الجميع */
async function requireAttendanceRead(
  user: rbac.AuthorizedUser,
  workerId: number,
  message: string
) {
  if (!rbac.hasPermission(user, rbac.ATTENDANCE_READ) && !(user.role === "worker" && user.workerId === workerId && rbac.hasPermission(user, "attendance:read:self"))) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
  await assertWorkerInScope(user, workerId);
}

function requestedWorker(user: rbac.AuthorizedUser, workerId?: number) {
  const id = workerId ?? (user.role === "worker" ? user.workerId : undefined);
  if (!id) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر العامل أولًا؛ حساب العامل يجب ربطه ببطاقته" });
  return id;
}

async function scopedRecord(user: rbac.AuthorizedUser, attendanceId: number) {
  const row = await repo.findById(attendanceId);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "سجل الحضور غير موجود" });
  await assertWorkerInScope(user, row.workerId);
  return row;
}

/** يحوّل أخطاء الـ Service إلى أخطاء tRPC */
function toTrpcError(error: unknown, fallbackMessage: string): never {
  if (error instanceof AttendanceError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof TRPCError) throw error;
  console.error(fallbackMessage, error);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
  });
}

export const attendanceRouter = router({
  /** تسجيل الحضور (الدخول) */
  recordCheckIn: protectedProcedure
    .input(
      z.object({
        workerId: z.number().optional(),
        checkInTime: z.date().optional(),
        location: z.string().optional(),
        deviceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_RECORD, "ليس لديك صلاحية لتسجيل الحضور");
      const workerId = requestedWorker(ctx.user, input.workerId);
      await assertWorkerInScope(ctx.user, workerId);

      try {
        const { lateMinutes } = await service.recordCheckIn({
          workerId,
          checkInTime: input.checkInTime,
          recordedBy: ctx.user.id,
        });
        return { success: true, message: "تم تسجيل الحضور بنجاح", lateMinutes };
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء تسجيل الحضور");
      }
    }),

  /** تسجيل الانصراف (الخروج) */
  recordCheckOut: protectedProcedure
    .input(
      z.object({
        attendanceId: z.number().optional(),
        workerId: z.number().optional(),
        checkOutTime: z.date().optional(),
        location: z.string().optional(),
        deviceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_RECORD, "ليس لديك صلاحية لتسجيل الانصراف");
      const record = input.attendanceId ? await scopedRecord(ctx.user, input.attendanceId) : undefined;
      const workerId = requestedWorker(ctx.user, input.workerId ?? record?.workerId);
      await assertWorkerInScope(ctx.user, workerId);
      if (record && record.workerId !== workerId) throw new TRPCError({ code: "BAD_REQUEST", message: "سجل الحضور لا يخص العامل المحدد" });

      try {
        const { overtimeMinutes } = await service.recordCheckOut({
          attendanceId: input.attendanceId,
          workerId,
          checkOutTime: input.checkOutTime,
          recordedBy: ctx.user.id,
        });
        return { success: true, message: "تم تسجيل الانصراف بنجاح", overtimeMinutes };
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء تسجيل الانصراف");
      }
    }),

  /** سجل الحضور اليومي */
  getDailyAttendance: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        departmentId: z.number().optional(),
        workerId: z.number().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_READ, "ليس لديك صلاحية لعرض سجلات الحضور");
      if (input.workerId) await assertWorkerInScope(ctx.user, input.workerId);

      return service.getDailyAttendance({
        date: input.date,
        limit: input.limit,
        offset: input.offset,
        workerIds: input.workerId ? [input.workerId] : await getScopedWorkerIds(ctx.user),
        departmentId: input.departmentId,
      });
    }),

  /** سجل حضور العامل ليوم معيّن */
  getByDate: protectedProcedure
    .input(
      z.object({
        workerId: z.number().optional(),
        date: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const workerId = requestedWorker(ctx.user, input.workerId);
      await requireAttendanceRead(ctx.user, workerId, "ليس لديك صلاحية لعرض هذا السجل");

      return service.getByDate({ workerId, date: input.date });
    }),

  /** سجلات الحضور لفترة زمنية */
  getByDateRange: protectedProcedure
    .input(
      z.object({
        workerId: z.number().optional(),
        startDate: z.date(),
        endDate: z.date(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const workerId = requestedWorker(ctx.user, input.workerId);
      await requireAttendanceRead(ctx.user, workerId, "ليس لديك صلاحية لعرض هذه السجلات");

      return service.getByDateRange({
        workerId,
        startDate: input.startDate,
        endDate: input.endDate,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /** تصحيح سجل الحضور */
  correctAttendance: protectedProcedure
    .input(
      z.object({
        attendanceId: z.number(),
        correctedCheckInTime: z.date().optional(),
        correctedCheckOutTime: z.date().optional(),
        reason: z.string().min(10),
        referenceDocument: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_CORRECT, "ليس لديك صلاحية لتصحيح سجلات الحضور");
      await scopedRecord(ctx.user, input.attendanceId);

      try {
        await service.correctAttendance({
          attendanceId: input.attendanceId,
          correctedCheckInTime: input.correctedCheckInTime,
          correctedCheckOutTime: input.correctedCheckOutTime,
          reason: input.reason,
          referenceDocument: input.referenceDocument,
          correctedBy: ctx.user.id,
        });
        return { success: true, message: "تم تقديم طلب التصحيح بنجاح" };
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء تصحيح سجل الحضور");
      }
    }),

  /** طلبات تصحيح الحضور المعلقة */
  getPendingCorrections: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(
      ctx.user,
      rbac.ATTENDANCE_APPROVE,
      "ليس لديك صلاحية لعرض طلبات تصحيح الحضور"
    );

    return service.getPendingCorrections(await getScopedWorkerIds(ctx.user));
  }),

  /** الموافقة على تصحيح الحضور */
  approveCorrection: protectedProcedure
    .input(
      z.object({
        correctionId: z.number(),
        approved: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_APPROVE, "ليس لديك صلاحية لاعتماد التصحيحات");
      const correction = await repo.findCorrectionById(input.correctionId);
      if (!correction) throw new TRPCError({ code: "NOT_FOUND", message: "طلب التصحيح غير موجود" });
      await scopedRecord(ctx.user, correction.attendanceId);

      try {
        await service.approveCorrection({
          correctionId: input.correctionId,
          approved: input.approved,
          notes: input.notes,
          approvedBy: ctx.user.id,
        });
        return {
          success: true,
          message: `تم ${input.approved ? "اعتماد" : "رفض"} التصحيح بنجاح`,
        };
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء اعتماد التصحيح");
      }
    }),

  /** سجل الحضور الشهري للعامل */
  getMonthlyAttendance: protectedProcedure
    .input(
      z.object({
        workerId: z.number().optional(),
        year: z.number(),
        month: z.number().min(1).max(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const workerId = requestedWorker(ctx.user, input.workerId);
      await requireAttendanceRead(ctx.user, workerId, "ليس لديك صلاحية لعرض هذه السجلات");

      return service.getMonthlyAttendance({
        workerId,
        year: input.year,
        month: input.month,
      });
    }),

  /** حساب ساعات العمل اليومية */
  calculateDailyHours: protectedProcedure
    .input(z.object({ attendanceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const record = await scopedRecord(ctx.user, input.attendanceId);
      await requireAttendanceRead(ctx.user, record.workerId, "ليس لديك صلاحية لعرض هذه الساعات");
      try {
        return await service.calculateDailyHours(input.attendanceId);
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء حساب الساعات");
      }
    }),

  /** تحديد العامل كغائب */
  markAbsent: protectedProcedure
    .input(
      z.object({
        workerId: z.number(),
        date: z.date(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, rbac.ATTENDANCE_RECORD, "ليس لديك صلاحية لتحديد الغياب");
      await assertWorkerInScope(ctx.user, input.workerId);

      try {
        await service.markAbsent({
          workerId: input.workerId,
          date: input.date,
          reason: input.reason,
          recordedBy: ctx.user.id,
        });
        return { success: true, message: "تم تحديد الغياب بنجاح" };
      } catch (error) {
        toTrpcError(error, "حدث خطأ أثناء تحديد الغياب");
      }
    }),

  /** إحصائيات الحضور */
  getStats: protectedProcedure
    .input(
      z.object({
        workerId: z.number().optional(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const workerId = requestedWorker(ctx.user, input.workerId);
      await requireAttendanceRead(ctx.user, workerId, "ليس لديك صلاحية لعرض هذه الإحصائيات");

      return service.getStats({
        workerId,
        startDate: input.startDate,
        endDate: input.endDate,
      });
    }),
});
