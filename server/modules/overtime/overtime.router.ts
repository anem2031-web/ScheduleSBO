import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { leaveDaySchema, leaveTimeSchema } from "../leaves/leaves.rules";
import * as service from "./overtime.service";
const note = z.string().trim().min(3, "اكتب السبب في 3 أحرف على الأقل").max(2000);
export const overtimeRouter = router({
  periodOptions: protectedProcedure.input(z.object({ workDate: leaveDaySchema, workerId: z.number().int().positive().optional() })).query(({ ctx, input }) => service.overtimePeriodOptions(ctx.user, input)),
  list: protectedProcedure.input(z.object({ workerId: z.number().int().positive().optional(), fromDate: leaveDaySchema, toDate: leaveDaySchema })).query(({ ctx, input }) => service.listOvertime(ctx.user, input)),
  create: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive(), overtimeKind: z.enum(["planned", "actual"]), attendanceId: z.number().int().positive().optional(), endTime: leaveTimeSchema.optional(), reason: note, initialDecision: z.boolean().optional() })).mutation(({ ctx, input }) => service.createOvertime(ctx.user, input)),
  review: protectedProcedure.input(z.object({ id: z.number().int().positive(), approved: z.boolean(), note })).mutation(({ ctx, input }) => service.reviewOvertime(ctx.user, input)),
  decide: protectedProcedure.input(z.object({ id: z.number().int().positive(), approved: z.boolean(), note: z.string().trim().max(2000).optional() })).mutation(({ ctx, input }) => service.decideOvertime(ctx.user, input)),
  reopen: protectedProcedure.input(z.object({ id: z.number().int().positive(), reason: note })).mutation(({ ctx, input }) => service.reopenOvertime(ctx.user, input)),
});
