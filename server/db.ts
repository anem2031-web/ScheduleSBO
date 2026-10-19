/**
 * ============================================================================
 * ⚠️ DEPRECATED — Compatibility Facade
 * ----------------------------------------------------------------------------
 * هذا الملف موجود فقط لأن طبقة _core (الخاصة بمنصة الاستضافة، لا نعدّلها)
 * تستورد منه. لا تضف أي دوال جديدة هنا.
 *
 * الدوال الفعلية انتقلت إلى:
 *   - الاتصال:        server/shared/db.ts
 *   - سجل التدقيق:    server/shared/audit.ts
 *   - المستخدمون:     server/modules/users/users.repository.ts
 *   - العمال/الأقسام: server/modules/workers/workers.repository.ts
 *   - الإشعارات:      server/modules/notifications/notifications.repository.ts
 *
 * عند إضافة استعلامات جديدة: ضعها في repository الوحدة المناسبة مباشرة.
 * ============================================================================
 */

export { getDb } from "./shared/db";
export { createAuditLog, getAuditLogs } from "./shared/audit";
export {
  upsertUser,
  getUserByOpenId,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getAllUsers,
  getUsersByRole,
} from "./modules/users/users.repository";
export {
  getWorkerById,
  getWorkerByEmployeeId,
  getWorkersByDepartment,
  getWorkersBySupervisor,
  getAllActiveWorkers,
  getAllDepartments,
  getDepartmentById,
  getJobTitlesByDepartment,
  getCurrentSalary,
  getSalaryHistory,
} from "./modules/workers/workers.repository";
export {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
} from "./modules/notifications/notifications.repository";
