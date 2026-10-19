import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import { getDb } from "../../shared/db";
import { createAuditLog } from "../../shared/audit";
import { eq, and } from "drizzle-orm";
import {
  schedules,
  shifts,
  workerCalendar,
  operatingPeriods,
} from "../../../drizzle/schema";

/**
 * ============================================================================
 * Schedules Router - محرك الجداول والورديات
 * ============================================================================
 *
 * يدير:
 * - إنشاء وتحديث الجداول الأسبوعية
 * - توزيع الورديات والساعات
 * - التقويم التشغيلي بتوقيت الرياض
 * - الإقفال اليومي التلقائي عند 04:29 صباحاً
 */

import * as scheduleService from "./schedules.service";
import * as assignmentsService from "./assignments.service";
import * as workerCardService from "./worker-card.service";
import * as weeklyBoardService from "./weekly-board.service";
import * as workerScope from "./worker-scope";
import * as assignmentRepository from "./assignments.repository";
import { ScheduleError } from "./schedules.service";
import { assertCostCenterScope } from "../../shared/worker-scope";

async function assertPrimaryWorkerWrite(user: rbac.AuthorizedUser, workerId: number) {
  const settings = await assignmentRepository.findWorkerScheduleSettings(workerId);
  await assertCostCenterScope(user, settings?.branch);
}

/** تحويل أخطاء طبقة الخدمة إلى أخطاء tRPC */
function toTRPC(e: unknown): never {
  if (e instanceof ScheduleError) {
    const map = {
      NOT_FOUND: "NOT_FOUND",
      BAD_REQUEST: "BAD_REQUEST",
      CONFLICT: "CONFLICT",
      FORBIDDEN_STATE: "PRECONDITION_FAILED",
    } as const;
    throw new TRPCError({ code: map[e.code], message: e.message });
  }
  throw e;
}

function requirePerm(
  user: Parameters<typeof rbac.hasPermission>[0],
  perm: string,
  msg: string,
) {
  if (!rbac.hasPermission(user, perm)) {
    throw new TRPCError({ code: "FORBIDDEN", message: msg });
  }
}

function requireWorkerScheduleRead(user: rbac.AuthorizedUser, workerId: number) {
  if (user.role === "worker" && user.workerId === workerId &&
      (rbac.hasPermission(user,"workers:read:self") || rbac.hasPermission(user,"attendance:read:self"))) return;
  requirePerm(user,rbac.SCHEDULE_READ,"ليس لديك صلاحية عرض جدول العامل");
}

function requireGlobalPeriod(user: rbac.AuthorizedUser) {
  if (user.role !== "admin" && user.accessScope != null)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "هذا الإجراء يشمل الأسبوع لجميع المراكز؛ يلزم حساب بصلاحية تغطي جميع المراكز",
    });
}
async function assertAssignmentWrite(
  user: rbac.AuthorizedUser,
  assignmentId: number,
) {
  const assignment =
    await assignmentRepository.findAssignmentById(assignmentId);
  if (!assignment)
    throw new TRPCError({ code: "NOT_FOUND", message: "الفترة غير موجودة" });
  const workDate =
    assignment.workDate instanceof Date
      ? assignment.workDate.toISOString().slice(0, 10)
      : String(assignment.workDate);
  await workerScope.assertScheduleWorkerRead(
    user,
    assignment.workerId,
    workDate,
  );
  if (user.role === "supervisor" && assignment.supervisorId !== user.id)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "يمكنك تعديل فتراتك فقط",
    });
  if (assignment.costCenterId != null) rbac.requireCostCenter(user, assignment.costCenterId);
  else await assertPrimaryWorkerWrite(user, assignment.workerId);
}

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ yyyy-mm-dd");
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "صيغة الوقت HH:MM");

export const schedulesRouter = router({
  getWeeklyBoard: protectedProcedure
    .input(z.object({ weekStart: dateStr }))
    .query(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_READ,
        "ليس لديك صلاحية عرض الجدول الأسبوعي",
      );
      return weeklyBoardService.getWeeklyBoard(ctx.user, input.weekStart);
    }),

  getWeeklyBoardPage: protectedProcedure
    .input(z.object({
      weekStart: dateStr,
      center: z.string().max(255).optional(),
      search: z.string().max(100).optional(),
      offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
      limit: z.number().int().min(1).max(100).default(32),
      workerIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).max(100).optional(),
    }))
    .query(({ ctx, input }) => weeklyBoardService.getWeeklyBoardPage(ctx.user, input.weekStart, input)),

  getWeeklyBoardExport: protectedProcedure
    .input(z.object({ weekStart: dateStr, center: z.string().max(255).optional() }))
    .query(({ ctx, input }) => weeklyBoardService.getWeeklyBoardExport(ctx.user, input.weekStart, input)),

  saveWeeklyCells: protectedProcedure
    .input(
      z.object({
        weekStart: dateStr,
        supervisorId: z.number().int().positive().optional(),
        changes: z
          .array(
            z.object({
              workerId: z.number().int().positive(),
              workDate: dateStr,
              intervals: z
                .array(
                  z.object({
                    startTime: timeStr,
                    endTime: timeStr,
                    breakMinutes: z.number().int().min(0).max(30).optional(),
                    costCenterId: z.number().int().positive().optional(),
                    locationId: z.number().int().positive().optional(),
                    departmentId: z.number().int().positive().optional(),
                    jobTitleId: z.number().int().positive().nullable().optional(),
                  }),
                )
                .max(6),
            }),
          )
          .min(1)
          .max(350),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Supervisor access is scoped inside the transaction; it does not grant
      // blanket schedule:create/update access to legacy unscoped endpoints.
      return weeklyBoardService.saveWeeklyCells(ctx.user, input);
    }),

  // =========================================================================
  // S2 — فترات الجداول (النموذج الجديد schedule_periods)
  // =========================================================================

  listPeriods: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "published", "locked", "cancelled", "archived"])
            .optional(),
          fromDate: dateStr.optional(),
          toDate: dateStr.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_READ,
        "ليس لديك صلاحية عرض فترات الجداول",
      );
      return scheduleService.listPeriods(input);
    }),

  getPeriod: protectedProcedure
    .input(z.object({ periodId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_READ,
        "ليس لديك صلاحية عرض فترات الجداول",
      );
      try {
        return await scheduleService.getPeriod(input.periodId);
      } catch (e) {
        toTRPC(e);
      }
    }),

  createPeriod: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        startDate: dateStr,
        endDate: dateStr,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_CREATE,
        "ليس لديك صلاحية إنشاء فترة جدول",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await scheduleService.createPeriod({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateDraftPeriod: protectedProcedure
    .input(
      z.object({
        periodId: z.number().int().positive(),
        name: z.string().min(1).max(200).optional(),
        startDate: dateStr.optional(),
        endDate: dateStr.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية تعديل فترة الجدول",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await scheduleService.updateDraftPeriod({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  publishPeriod: protectedProcedure
    .input(z.object({ periodId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_APPROVE,
        "ليس لديك صلاحية نشر فترة الجدول",
      );
      try {
        return await scheduleService.publishPeriod({
          periodId: input.periodId,
          publishedBy: ctx.user.id,
          actor: ctx.user,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  cancelPeriod: protectedProcedure
    .input(
      z.object({
        periodId: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_APPROVE,
        "ليس لديك صلاحية إلغاء فترة الجدول",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await scheduleService.cancelPeriod({
          ...input,
          cancelledBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  lockPeriod: protectedProcedure
    .input(z.object({ periodId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_LOCK,
        "ليس لديك صلاحية إقفال فترة الجدول",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await scheduleService.lockPeriod({
          periodId: input.periodId,
          lockedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  reopenPeriod: protectedProcedure
    .input(
      z.object({
        periodId: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_LOCK,
        "ليس لديك صلاحية إعادة فتح فترة الجدول",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await scheduleService.reopenPeriod({
          ...input,
          reopenedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // =========================================================================
  // S2 — قوالب الورديات (shift_templates)
  // =========================================================================

  listShiftTemplates: protectedProcedure
    .input(
      z
        .object({
          activeOnly: z.boolean().optional(),
          departmentId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      requirePerm(ctx.user, rbac.SCHEDULE_READ, "ليس لديك صلاحية عرض الورديات");
      return scheduleService.listShiftTemplates(input);
    }),

  createShiftTemplate: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(50),
        nameAr: z.string().min(1).max(200),
        nameEn: z.string().min(1).max(200),
        startTime: timeStr,
        endTime: timeStr,
        breakMinutes: z.number().int().min(0).max(30).optional(),
        departmentId: z.number().int().positive().optional(),
        effectiveFrom: dateStr.optional(),
        effectiveTo: dateStr.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_CREATE,
        "ليس لديك صلاحية إنشاء وردية",
      );
      try {
        return await scheduleService.createShiftTemplate({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateShiftTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        nameAr: z.string().min(1).max(200).optional(),
        nameEn: z.string().min(1).max(200).optional(),
        startTime: timeStr.optional(),
        endTime: timeStr.optional(),
        breakMinutes: z.number().int().min(0).max(30).optional(),
        departmentId: z.number().int().positive().nullable().optional(),
        effectiveFrom: dateStr.nullable().optional(),
        effectiveTo: dateStr.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية تعديل الوردية",
      );
      try {
        return await scheduleService.updateShiftTemplate({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  setShiftTemplateActive: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية تعطيل/تفعيل الوردية",
      );
      try {
        return await scheduleService.setShiftTemplateActive({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // =========================================================================
  // بطاقة العامل والترحيل (WORKER_CARD_SPEC — المرحلة أ)
  // =========================================================================

  getWorkerCard: protectedProcedure
    .input(z.object({ workerId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      requireWorkerScheduleRead(ctx.user,input.workerId);
      await workerScope.assertScheduleWorkerRead(ctx.user, input.workerId);
      return workerCardService.getWorkerCard(input.workerId);
    }),

  saveWorkerCard: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        requiredDailyHours: z.number().min(0.5).max(24),
        branch: z.string().max(50).nullable().optional(),
        weeklyRestDay: z.number().int().min(0).max(6).nullable().optional(),
        patternType: z.enum(["single", "split"]),
        p1Start: timeStr,
        p1End: timeStr,
        p2Start: timeStr.nullable().optional(),
        p2End: timeStr.nullable().optional(),
        dayOverrides: z
          .record(
            z.string(),
            z.object({
              p1Start: timeStr,
              p1End: timeStr,
              p2Start: timeStr.optional(),
              p2End: timeStr.optional(),
            }),
          )
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية تعديل بطاقة الدوام",
      );
      try {
        await workerScope.assertScheduleWorkerRead(ctx.user, input.workerId);
        await assertPrimaryWorkerWrite(ctx.user, input.workerId);
        return await workerCardService.saveWorkerCard({
          ...input,
          savedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  addWorkerLeave: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        leaveType: z.enum(["annual", "sick", "emergency"]),
        fromDate: dateStr,
        toDate: dateStr,
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية إضافة إجازة",
      );
      try {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "استخدم طلبات الإجازة لاعتماد الإجازة من الشؤون الإدارية",
        });
        return await workerCardService.addWorkerLeave({
          ...input,
          addedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  listWorkerLeaves: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        fromDate: dateStr,
        toDate: dateStr,
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerScheduleRead(ctx.user,input.workerId);
      await workerScope.assertScheduleWorkerRead(
        ctx.user,
        input.workerId,
        input.fromDate,
        input.toDate,
      );
      return workerCardService.listWorkerLeaves(
        input.workerId,
        input.fromDate,
        input.toDate,
      );
    }),

  removeWorkerLeave: protectedProcedure
    .input(
      z.object({
        entryId: z.number().int().positive(),
        workerId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(ctx.user, rbac.SCHEDULE_UPDATE, "ليس لديك صلاحية حذف إجازة");
      try {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ألغِ طلب الإجازة من شاشة الطلبات مع كتابة السبب",
        });
        return await workerCardService.removeWorkerLeaveEntry({
          ...input,
          removedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  getWorkerTimeline: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        refDate: dateStr,
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerScheduleRead(ctx.user,input.workerId);
      await workerScope.assertScheduleWorkerRead(
        ctx.user,
        input.workerId,
        input.refDate,
      );
      try {
        return await workerCardService.getWorkerTimeline(
          input.workerId,
          input.refDate,
        );
      } catch (e) {
        toTRPC(e);
      }
    }),

  rolloutPeriodFromCards: protectedProcedure
    .input(z.object({ periodId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_CREATE,
        "ليس لديك صلاحية ترحيل الأسبوع",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await workerCardService.rolloutPeriodFromCards({
          periodId: input.periodId,
          rolledBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // =========================================================================
  // S3 — التكليفات والحجوزات (shift_assignments)
  // =========================================================================

  listAssignments: protectedProcedure
    .input(
      z.object({
        periodId: z.number().int().positive().optional(),
        workerId: z.number().int().positive().optional(),
        supervisorId: z.number().int().positive().optional(),
        workDate: dateStr.optional(),
        fromDate: dateStr.optional(),
        toDate: dateStr.optional(),
        includeCancelled: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_READ,
        "ليس لديك صلاحية عرض التكليفات",
      );
      return workerScope.listScopedAssignments(ctx.user, input);
    }),

  createAssignment: protectedProcedure
    .input(
      z.object({
        periodId: z.number().int().positive(),
        workerId: z.number().int().positive(),
        shiftTemplateId: z.number().int().positive(),
        supervisorId: z.number().int().positive().optional(),
        departmentId: z.number().int().positive().optional(),
        workDate: dateStr,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_CREATE,
        "ليس لديك صلاحية إنشاء تكليف",
      );
      try {
        await workerScope.assertScheduleWorkerRead(
          ctx.user,
          input.workerId,
          input.workDate,
        );
        // This legacy endpoint has no destination picker; it creates at the primary center.
        await assertPrimaryWorkerWrite(ctx.user, input.workerId);
        if (
          ctx.user.role === "supervisor" &&
          input.supervisorId &&
          input.supervisorId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "يمكنك إضافة فتراتك فقط",
          });
        return await assignmentsService.createAssignment({
          ...input,
          supervisorId: input.supervisorId ?? ctx.user.id,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  confirmAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية تأكيد التكليف",
      );
      try {
        await assertAssignmentWrite(ctx.user, input.assignmentId);
        return await assignmentsService.confirmAssignment({
          assignmentId: input.assignmentId,
          confirmedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  cancelAssignment: protectedProcedure
    .input(
      z.object({
        assignmentId: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية إلغاء التكليف",
      );
      try {
        await assertAssignmentWrite(ctx.user, input.assignmentId);
        return await assignmentsService.cancelAssignment({
          ...input,
          cancelledBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  transferAssignment: protectedProcedure
    .input(
      z.object({
        assignmentId: z.number().int().positive(),
        newWorkDate: dateStr.optional(),
        newShiftTemplateId: z.number().int().positive().optional(),
        newSupervisorId: z.number().int().positive().optional(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_UPDATE,
        "ليس لديك صلاحية نقل التكليف",
      );
      try {
        await assertAssignmentWrite(ctx.user, input.assignmentId);
        return await assignmentsService.transferAssignment({
          ...input,
          transferredBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  copyDayAssignments: protectedProcedure
    .input(
      z.object({
        sourceDate: dateStr,
        targetDate: dateStr,
        targetPeriodId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePerm(
        ctx.user,
        rbac.SCHEDULE_CREATE,
        "ليس لديك صلاحية نسخ التكليفات",
      );
      try {
        requireGlobalPeriod(ctx.user);
        return await assignmentsService.copyDayAssignments({
          ...input,
          copiedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  getTimeBalance: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        periodId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireWorkerScheduleRead(ctx.user,input.workerId);
      await workerScope.assertScheduleWorkerRead(ctx.user, input.workerId);
      return assignmentsService.getTimeBalance(input.workerId, input.periodId);
    }),

  // =========================================================================
  // إجراءات النموذج القديم (schedules/shifts) — تبقى مؤقتًا حتى اكتمال الهجرة
  // =========================================================================

  /**
   * الحصول على الجدول الأسبوعي
   */
  getWeeklySchedule: protectedProcedure
    .input(
      z.object({
        departmentId: z.number(),
        weekStartDate: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.SCHEDULE_READ)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لعرض الجداول",
        });
      }

      requireGlobalPeriod(ctx.user);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const schedule = await db
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.departmentId, input.departmentId),
            eq(schedules.weekStartDate, input.weekStartDate),
          ),
        )
        .limit(1);

      return schedule.length > 0 ? schedule[0] : null;
    }),

  /**
   * إنشاء جدول أسبوعي جديد
   */
  createWeeklySchedule: protectedProcedure
    .input(
      z.object({
        departmentId: z.number(),
        weekStartDate: z.date().refine((value) => value.getUTCDay() === 0, "اختر أسبوعًا يبدأ يوم الأحد"),
        scheduleData: z.object({
          totalHours: z.number(),
          shifts: z.array(
            z.object({
              dayOfWeek: z.number().min(0).max(6),
              shiftId: z.number(),
              startTime: z.string(),
              endTime: z.string(),
            }),
          ),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.SCHEDULE_CREATE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لإنشاء جداول",
        });
      }

      try {
        requireGlobalPeriod(ctx.user);
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من عدم وجود جدول مطابق
        const existing = await db
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.departmentId, input.departmentId),
              eq(schedules.weekStartDate, input.weekStartDate),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "يوجد جدول بالفعل لهذه الفترة",
          });
        }

        // إنشاء الجدول
        const weekEndDate = new Date(input.weekStartDate);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);

        const result = await db.insert(schedules).values({
          departmentId: input.departmentId,
          weekStartDate: input.weekStartDate,
          weekEndDate: weekEndDate,
          scheduleCode: `SCH-${Date.now()}`,
          status: "draft",
          createdBy: ctx.user.id,
        });

        // تسجيل العملية
        await createAuditLog(
          "schedules",
          1,
          "create",
          ctx.user.id,
          undefined,
          input.scheduleData,
          "تم إنشاء جدول أسبوعي جديد",
        );

        return {
          success: true,
          message: "تم إنشاء الجدول بنجاح",
          scheduleId: 1,
        };
      } catch (error) {
        console.error("Error creating schedule:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء إنشاء الجدول",
        });
      }
    }),

  /**
   * الموافقة على الجدول الأسبوعي
   */
  approveSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.SCHEDULE_APPROVE)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لاعتماد الجداول",
        });
      }

      try {
        requireGlobalPeriod(ctx.user);
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db
          .update(schedules)
          .set({
            status: "published",
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(schedules.id, input.scheduleId));

        // تسجيل العملية
        await createAuditLog(
          "schedules",
          input.scheduleId,
          "approve",
          ctx.user.id,
          { status: "draft" },
          { status: "published" },
          "تم اعتماد الجدول الأسبوعي",
        );

        return { success: true, message: "تم اعتماد الجدول بنجاح" };
      } catch (error) {
        console.error("Error approving schedule:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء اعتماد الجدول",
        });
      }
    }),

  /**
   * قفل الفترة التشغيلية (اليوم)
   */
  lockOperatingPeriod: protectedProcedure
    .input(z.object({ periodDate: z.date() }))
    .mutation(async ({ ctx, input }) => {
      if (!rbac.hasPermission(ctx.user, rbac.SCHEDULE_LOCK)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ليس لديك صلاحية لقفل الفترات",
        });
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // التحقق من عدم قفل الفترة بالفعل
        const existing = await db
          .select()
          .from(operatingPeriods)
          .where(eq(operatingPeriods.periodDate, input.periodDate))
          .limit(1);

        if (existing.length > 0 && existing[0].isLocked) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "الفترة مقفولة بالفعل",
          });
        }

        // قفل الفترة
        if (existing.length > 0) {
          await db
            .update(operatingPeriods)
            .set({
              isLocked: true,
              lockedAt: new Date(),
              lockedBy: ctx.user.id,
            })
            .where(eq(operatingPeriods.periodDate, input.periodDate));
        } else {
          await db.insert(operatingPeriods).values({
            periodDate: input.periodDate,
            periodType: "daily",
            isLocked: true,
            lockedAt: new Date(),
            lockedBy: ctx.user.id,
          });
        }

        // تسجيل العملية
        await createAuditLog(
          "operating_periods",
          0,
          "update",
          ctx.user.id,
          undefined,
          { periodDate: input.periodDate, isLocked: true },
          "تم قفل الفترة التشغيلية",
        );

        return { success: true, message: "تم قفل الفترة بنجاح" };
      } catch (error) {
        console.error("Error locking period:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "حدث خطأ أثناء قفل الفترة",
        });
      }
    }),

  /**
   * الحصول على حالة الفترة التشغيلية
   */
  getPeriodStatus: protectedProcedure
    .input(z.object({ periodDate: z.date() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const period = await db
        .select()
        .from(operatingPeriods)
        .where(eq(operatingPeriods.periodDate, input.periodDate))
        .limit(1);

      return period.length > 0 ? period[0] : null;
    }),

  /**
   * الحصول على الورديات المتاحة
   */
  getAvailableShifts: protectedProcedure.query(async ({ ctx }) => {
    requirePerm(ctx.user, rbac.SCHEDULE_READ, "ليس لديك صلاحية عرض الورديات");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db.select().from(shifts);
  }),
});
