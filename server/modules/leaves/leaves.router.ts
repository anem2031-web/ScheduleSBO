import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { leaveDaySchema, leaveInputSchema } from "./leaves.rules";
import * as service from "./leaves.service";

export const leavesRouter = router({
  list: protectedProcedure.input(z.object({ workerId: z.number().int().positive().optional(), fromDate: leaveDaySchema, toDate: leaveDaySchema }))
    .query(({ ctx, input }) => service.listLeaves(ctx.user, input)),
  create: protectedProcedure.input(leaveInputSchema).mutation(({ ctx, input }) => service.saveLeave(ctx.user, input)),
  update: protectedProcedure.input(leaveInputSchema.and(z.object({ requestId: z.number().int().positive() }))).mutation(({ ctx, input }) => service.saveLeave(ctx.user, input)),
  decide: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), approved: z.boolean(), decisionNote: z.string().trim().max(2000).optional(), permissionMode: z.enum(["excused", "make_up"]).optional() }))
    .mutation(({ ctx, input }) => service.decideLeave(ctx.user, input)),
  cancel: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), reason: z.string().trim().min(3, "اكتب سبب الإلغاء").max(2000) }))
    .mutation(({ ctx, input }) => service.cancelLeave(ctx.user, input)),
});
