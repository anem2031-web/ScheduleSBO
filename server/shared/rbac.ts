import type { User } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { permits, type AccessScope } from "../../shared/access-control";

export type AuthorizedUser = User & { permissions?: string[]; accessScope?: AccessScope; workerId?: number };

/**
 * Define permissions for each role
 */
// Legacy RBAC constants for backward compatibility
export const WORKERS_READ = "workers:read";
export const WORKERS_CREATE = "workers:create";
export const WORKERS_UPDATE = "workers:update";
export const WORKERS_DELETE = "workers:delete";

export const ATTENDANCE_READ = "attendance:read";
export const ATTENDANCE_RECORD = "attendance:record";
export const ATTENDANCE_CORRECT = "attendance:correct";
export const ATTENDANCE_APPROVE = "attendance:approve";

export const PAYROLL_READ = "payroll:read";
export const PAYROLL_CALCULATE = "payroll:calculate";
export const PAYROLL_APPROVE = "payroll:approve";
export const PAYROLL_EXECUTE = "payroll:execute";

export const USERS_READ = "users:read";
export const USERS_CREATE = "users:create";
export const USERS_UPDATE = "users:update";
export const USERS_DELETE = "users:delete";
export const USERS_MANAGE_ROLES = "users:assign_role";

export const ROLES_READ = "roles:read";
export const ROLES_CREATE = "roles:create";
export const ROLES_UPDATE = "roles:update";
export const ROLES_DELETE = "roles:delete";

export const AUDIT_READ = "audit:read";
export const EVALUATION_READ = "evaluation:read";
export const EVALUATION_CREATE = "evaluation:create";
export const EVALUATION_UPDATE = "evaluation:update";
export const EVALUATION_APPROVE = "evaluation:approve";
export const INCENTIVE_READ = "incentive:read";
export const INCENTIVE_CREATE = "incentive:create";
export const INCENTIVE_APPROVE = "incentive:approve";
export const REQUEST_READ = "requests:read";
export const REQUEST_CREATE = "requests:create";
export const REQUEST_APPROVE = "requests:approve";

export const SCHEDULE_READ = "schedule:read";
export const SCHEDULE_CREATE = "schedule:create";
export const SCHEDULE_UPDATE = "schedule:update";
export const SCHEDULE_APPROVE = "schedule:approve";
export const SCHEDULE_LOCK = "schedule:lock";
export const SCHEDULE_EXPORT = "schedule:export";
export const LEAVE_READ = "leave:read";
export const LEAVE_CREATE = "leave:create";
export const LEAVE_APPROVE = "leave:approve";
export const LEAVE_CANCEL = "leave:cancel";

export const ORG_STRUCTURE_READ = "org_structure:read";
export const ORG_STRUCTURE_MANAGE = "org_structure:manage";

export const USER_READ = "users:read";
export const USER_CREATE = "users:create";
export const USER_UPDATE = "users:update";
export const USER_DELETE = "users:delete";
export const USER_MANAGE_ROLES = "users:assign_role";

export const ROLE_PERMISSIONS: Record<User["role"], string[]> = {
  admin: [
    // User management
    "users:read",
    "users:create",
    "users:update",
    "users:delete",
    "users:assign_role",
    // System settings
    "settings:read",
    "settings:update",
    // Attendance
    "attendance:read",
    "attendance:record",
    "attendance:correct",
    "attendance:approve",
    // Schedules
    "schedule:read",
    "schedule:create",
    "schedule:update",
    "schedule:approve",
    "schedule:lock",
    // Evaluations
    "evaluation:create",
    "evaluation:read",
    "evaluation:approve",
    // Incentives
    "incentive:read",
    "incentive:approve",
    // All other permissions
    "*",
  ],
  hr_admin: [
    SCHEDULE_EXPORT,
    LEAVE_READ, LEAVE_CREATE, LEAVE_APPROVE, LEAVE_CANCEL,
    "overtime:read", "overtime:create", "overtime:approve",
    ATTENDANCE_APPROVE,
    "workers:read",
    "workers:create",
    "workers:update",
    "workers:delete",
    "departments:read",
    "job_titles:read",
    "requests:read",
    "requests:approve",
    "evaluations:read",
    "evaluations:create",
    "evaluations:update",
    "evaluation:create",
    "evaluation:read",
    "evaluation:approve",
    "attendance:read",
    "attendance:record",
    "attendance:correct",
    "schedule:read",
    "schedule:create",
    "schedule:update",
    "schedule:approve",
    "incentive:read",
    "incentive:approve",
    "users:read",
    "org_structure:read",
    "org_structure:manage",
  ],
  supervisor: [
    SCHEDULE_CREATE, SCHEDULE_UPDATE, SCHEDULE_EXPORT,
    LEAVE_READ, LEAVE_CREATE,
    "overtime:read", "overtime:create", "overtime:review",
    "workers:read",
    "attendance:read",
    "attendance:record",
    "requests:read",
    "requests:approve",
    "evaluations:read",
    "evaluations:create",
    "evaluation:create",
    "evaluation:read",
    "schedule:read",
    "incentive:read",
  ],
  guard: [
    "attendance:read",
    "attendance:record",
    "attendance:correct",
  ],
  worker: [
    "workers:read:self",
    "attendance:read:self",
    "requests:read:self",
    "requests:create",
    "evaluations:read:self",
    "evaluation:read",
  ],
  financial_reviewer: [
    "payroll:read",
    "payroll:review",
    "incentives:read",
    "requests:read",
    "incentive:read",
    "incentive:approve",
  ],
  finance: [
    "payroll:read",
    "payroll:approve",
    "incentives:read",
    "incentives:approve",
    "incentive:read",
    "incentive:approve",
  ],
  accounting_head: [
    "payroll:read",
    "payroll:execute",
    "incentives:read",
    "incentives:execute",
    "incentive:read",
    "incentive:approve",
  ],
  modifier: [
    "attendance:read",
    "attendance:correct",
    "payroll:read",
    "payroll:modify",
    "attendance:approve",
    "schedule:read",
    "schedule:update",
  ],
};

/**
 * Check if user has permission
 * Accepts either a User object or a role string
 */
export function effectivePermissions(userOrRole: Pick<AuthorizedUser, "role" | "permissions"> | string): string[] {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  if (role === "admin") return ["*"];
  if (typeof userOrRole !== "string" && Array.isArray(userOrRole.permissions)) return userOrRole.permissions;
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [];
}

export function hasPermission(userOrRole: Pick<AuthorizedUser, "role" | "permissions"> | string, permission: string): boolean {
  return permits(effectivePermissions(userOrRole), permission);
}

/**
 * Throw error if user doesn't have permission
 */
export function requirePermission(user: Pick<AuthorizedUser, "role" | "permissions">, permission: string): void {
  if (!hasPermission(user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية لتنفيذ هذا الإجراء",
    });
  }
}

export function isCostCenterAllowed(user: Pick<AuthorizedUser, "role" | "accessScope">, costCenterId: number | null | undefined): boolean {
  if (user.role === "admin" || user.accessScope == null) return true;
  return costCenterId != null && user.accessScope.costCenterIds.includes(costCenterId);
}

export function requireCostCenter(user: Pick<AuthorizedUser, "role" | "accessScope">, costCenterId: number | null | undefined): void {
  if (!isCostCenterAllowed(user, costCenterId)) throw new TRPCError({ code: "FORBIDDEN", message: "هذا المركز خارج نطاق صلاحياتك" });
}

/**
 * Check if user can access worker data
 */
export function canAccessWorker(user: User, workerId: number, currentUserId: number): boolean {
  if (user.role === "admin" || user.role === "hr_admin") {
    return true;
  }
  
  if (user.role === "worker" && workerId === currentUserId) {
    return true;
  }
  
  return false;
}
