import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as service from "./operations.service";
import { operationalDate } from "../../../shared/operational-day";

export const operationsRouter = router({
  dailyOverview: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(({ ctx, input }) => service.dailyOverview(ctx.user, input.date)),
  reviewQueue: protectedProcedure
    .input(z.object({ month: z.string() }))
    .query(({ ctx, input }) => {
      const today = operationalDate();
      return service.reviewQueue(ctx.user, input.month, today);
    }),
});
