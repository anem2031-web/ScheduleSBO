import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

/**
 * ============================================================================
 * App Router — تجميع routers الوحدات فقط
 * ----------------------------------------------------------------------------
 * هذا الملف طبقة تجميع (Composition Root) لا غير:
 * لا تكتب أي procedures هنا — أنشئها داخل router الوحدة المناسبة في
 * server/modules/<module>/<module>.router.ts ثم سجّلها هنا بسطر واحد.
 * ============================================================================
 */

// if you need to use socket.io, read and register route in server/_core/index.ts,
// all api should start with '/api/' so that the gateway can route correctly
import { aiAssistantRouter } from "./modules/ai-assistant/ai-assistant.router";
import { approvalCycleRouter } from "./modules/approvals/approval-cycle.router";
import { attendanceRouter } from "./modules/attendance/attendance.router";
import { authRouter } from "./modules/auth/auth.router";
import { evaluationsRouter } from "./modules/evaluations/evaluations.router";
import { advancedIncentivesRouter } from "./modules/incentives/advanced-incentives.router";
import { incentivesRouter } from "./modules/incentives/incentives.router";
import { advancedNotificationsRouter } from "./modules/notifications/advanced-notifications.router";
import { notificationsRouter } from "./modules/notifications/notifications.router";
import { scheduledTasksRouter } from "./modules/scheduled-tasks/scheduled-tasks.router";
import { schedulesRouter } from "./modules/schedules/schedules.router";
import { orgStructureRouter } from "./modules/org-structure/org-structure.router";
import { supervisorAssignmentsRouter } from "./modules/supervisor-assignments/supervisor-assignments.router";
import { translationsRouter } from "./modules/translations/translations.router";
import { usersRouter } from "./modules/users/users.router";
import { workersRouter } from "./modules/workers/workers.router";
import { operationsRouter } from "./modules/operations/operations.router";
import { leavesRouter } from "./modules/leaves/leaves.router";
import { overtimeRouter } from "./modules/overtime/overtime.router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,

  users: usersRouter,
  workers: workersRouter,
  operations: operationsRouter,
  leaves: leavesRouter,
  overtime: overtimeRouter,
  schedules: schedulesRouter,
  orgStructure: orgStructureRouter,
  supervisorAssignments: supervisorAssignmentsRouter,
  attendance: attendanceRouter,
  evaluations: evaluationsRouter,
  incentives: incentivesRouter,
  advancedIncentives: advancedIncentivesRouter,
  notifications: notificationsRouter,
  advancedNotifications: advancedNotificationsRouter,
  approvalCycle: approvalCycleRouter,
  scheduledTasks: scheduledTasksRouter,
  translations: translationsRouter,
  aiAssistant: aiAssistantRouter,
});

export type AppRouter = typeof appRouter;
