/** Public permission names and labels; authorization is enforced by the server. */
export const PERMISSION_CATALOG = [
  ["workers:read", "العمال", "عرض العمال"],
  ["workers:create", "العمال", "إضافة العمال"],
  ["workers:update", "العمال", "تعديل العمال وارتباطاتهم"],
  ["workers:delete", "العمال", "أرشفة العمال واستعادتهم"],
  ["org_structure:read", "التهيئة", "عرض الهيكل التشغيلي"],
  ["org_structure:manage", "التهيئة", "إدارة مراكز التكلفة والمواقع والأقسام"],
  ["schedule:read", "الجداول", "عرض الجداول والأرصدة"],
  ["schedule:create", "الجداول", "إنشاء الجداول والفترات"],
  ["schedule:update", "الجداول", "تعديل الجداول"],
  ["schedule:approve", "الجداول", "اعتماد ونشر الجداول"],
  ["schedule:lock", "الجداول", "إقفال وإعادة فتح الجداول"],
  ["schedule:export", "الجداول", "تصدير الجداول"],
  ["attendance:read", "الحضور", "عرض الحضور"],
  ["attendance:record", "الحضور", "تسجيل الحضور والانصراف"],
  ["attendance:correct", "الحضور", "طلب تصحيح الحضور"],
  ["attendance:approve", "الحضور", "اعتماد تصحيح الحضور"],
  ["leave:read", "الإجازات", "عرض الإجازات والاستئذان"],
  ["leave:create", "الإجازات", "تقديم طلب الإجازة والاستئذان"],
  ["leave:approve", "الإجازات", "اعتماد أو رفض الإجازة والاستئذان"],
  ["leave:cancel", "الإجازات", "إلغاء الإجازة والاستئذان"],
  ["overtime:read", "الزيادة", "عرض طلبات زيادة الساعات"],
  ["overtime:create", "الزيادة", "طلب زيادة مخططة أو فعلية"],
  ["overtime:review", "الزيادة", "المراجعة الأولية للزيادة"],
  ["overtime:approve", "الزيادة", "الاعتماد النهائي للزيادة"],
  ["requests:read", "الطلبات", "عرض الطلبات العامة"],
  ["requests:create", "الطلبات", "إنشاء الطلبات العامة"],
  ["requests:approve", "الطلبات", "اعتماد الطلبات العامة"],
  ["users:read", "الحسابات", "عرض الحسابات والمشرفين"],
  ["users:create", "الحسابات", "إنشاء حساب مستخدم"],
  ["users:update", "الحسابات", "تفعيل وتعطيل الحسابات"],
  ["users:delete", "الحسابات", "أرشفة المشرفين"],
  ["users:assign_role", "الحسابات", "إدارة الأدوار والصلاحيات والنطاق"],
  ["audit:read", "السجلات", "عرض سجل التدقيق"],
  ["evaluation:read", "التقييم", "عرض التقييمات"],
  ["evaluation:create", "التقييم", "إضافة التقييمات"],
  ["evaluation:update", "التقييم", "تعديل التقييمات"],
  ["evaluation:approve", "التقييم", "اعتماد التقييمات"],
  ["incentive:read", "الحوافز", "عرض الحوافز"],
  ["incentive:create", "الحوافز", "إضافة الحوافز"],
  ["incentive:approve", "الحوافز", "اعتماد الحوافز"],
  ["payroll:read", "الرواتب", "عرض الرواتب"],
  ["payroll:calculate", "الرواتب", "حساب الرواتب"],
  ["payroll:review", "الرواتب", "مراجعة الرواتب"],
  ["payroll:approve", "الرواتب", "اعتماد الرواتب"],
  ["payroll:execute", "الرواتب", "تنفيذ الرواتب"],
  ["payroll:modify", "الرواتب", "تعديل الرواتب"],
  ["settings:read", "الإعدادات", "عرض إعدادات النظام"],
  ["settings:update", "الإعدادات", "تعديل إعدادات النظام"],
] as const;

export type PermissionCode = (typeof PERMISSION_CATALOG)[number][0];
export type AccessScope = { costCenterIds: number[] } | null;
export const MIN_PASSWORD_LENGTH = 7;
export const PASSWORD_LENGTH_MESSAGE = "كلمة المرور قصيرة. أدخل 7 خانات على الأقل؛ يمكن استخدام أرقام أو حروف أو كليهما.";
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{2,64}$/;

export function permits(permissions: readonly string[], permission: string): boolean {
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${permission.split(":")[0]}:*`);
}
