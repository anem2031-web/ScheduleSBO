import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import * as service from "./supervisor-assignments.service";
import { SupervisorAssignmentError } from "./supervisor-assignments.service";
import { assertWorkerInScope } from "../../shared/worker-scope";
import { findById } from "./supervisor-assignments.repository";

function toTRPC(e: unknown): never {
  if (e instanceof SupervisorAssignmentError) {
    const map = {
      NOT_FOUND: "NOT_FOUND",
      BAD_REQUEST: "BAD_REQUEST",
      CONFLICT: "CONFLICT",
    } as const;
    throw new TRPCError({ code: map[e.code], message: e.message });
  }
  throw e;
}

function requireRead(role: Parameters<typeof rbac.hasPermission>[0]) {
  if (!rbac.hasPermission(role, rbac.WORKERS_READ)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية عرض إسنادات المشرفين",
    });
  }
}

function requireManage(role: Parameters<typeof rbac.hasPermission>[0]) {
  if (!rbac.hasPermission(role, rbac.WORKERS_UPDATE)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية إدارة إسنادات المشرفين",
    });
  }
}

export const supervisorAssignmentsRouter = router({
  listAssignments: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => {
      requireRead(ctx.user);
      return service.listAssignmentsForViewer(ctx.user, input?.activeOnly);
    }),

  createAssignment: protectedProcedure
    .input(
      z.object({
        workerId: z.number().int().positive(),
        supervisorId: z.number().int().positive(),
        assignmentType: z
          .enum(["primary", "secondary", "temporary"])
          .default("primary"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      await assertWorkerInScope(ctx.user, input.workerId);
      try {
        return await service.createAssignment({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  endAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      const assignment = await findById(input.assignmentId);
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "الإسناد غير موجود" });
      await assertWorkerInScope(ctx.user, assignment.workerId);
      try {
        return await service.endAssignment({
          assignmentId: input.assignmentId,
          endedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),
});
