# فهرس الوحدات — MODULES.md

> خريطة سريعة للمشروع. عند إضافة وحدة جديدة أضف سطرها هنا.
> القواعد الكاملة في [ARCHITECTURE.md](./ARCHITECTURE.md).

## وحدات الخادم (server/modules/)

| الوحدة | المسؤولية | الطبقات الموجودة | تعتمد على |
|---|---|---|---|
| `auth` | **مصادقة محلية**: دخول/خروج بالبريد وكلمة المرور، جلسات JWT (كوكي httpOnly)، إنشاء حسابات للمسؤولين | router + service + tests | `users` (repository), `shared/rbac` |
| `users` | حسابات المستخدمين والأدوار | router + repository | `shared/rbac`, `shared/audit` |
| `workers` | العمال، الأقسام، المسميات الوظيفية، الرواتب | router + repository | `shared/rbac` |
| `attendance` | الحضور والانصراف، التصحيحات، الإحصائيات — **الوحدة المرجعية** ⭐ | router + service + repository + tests | `shared/rbac`, `shared/audit` |
| `schedules` | الجداول والورديات | router | `shared/rbac`, `shared/audit` |
| `evaluations` | تقييمات الأداء | router | `shared/rbac`, `shared/audit` |
| `incentives` | الحوافز والخصومات + القواعد المتقدمة (ملفّا router) | routers | `shared/rbac`, `shared/audit` |
| `notifications` | الإشعارات الأساسية والمتقدمة (ملفّا router) | routers + repository | `shared/audit` |
| `approvals` | دورة الاعتماد المالي وسير الموافقات | router + service | `shared/audit` |
| `scheduled-tasks` | المهام المجدولة وفترات التشغيل والإقفال اليومي | router + setup | `_core/heartbeat`, `shared/audit` |
| `translations` | الترجمات (عربي/إنجليزي/أردو) | router | — |
| `ai-assistant` | المساعد الذكي والتحليلات بالـ LLM | router | `_core/llm`, `shared/audit` |

## المشترك (server/shared/)

| الملف | الغرض |
|---|---|
| `db.ts` | اتصال قاعدة البيانات الوحيد (`getDb`) |
| `rbac.ts` | الأدوار والصلاحيات (`hasPermission`, `requirePermission`, الثوابت) |
| `audit.ts` | سجل التدقيق (`createAuditLog`, `getAuditLogs`) |
| `storage.ts` | رفع/تنزيل الملفات عبر S3 presigned URLs |

## واجهة العميل (client/src/)

| المسار | الغرض |
|---|---|
| `features/ai-assistant/` | مكوّنات المساعد الذكي (AIChatBox) |
| `features/attendance/` | مكوّنات الحضور (Map للموقع الجغرافي) |
| `features/auth/` | نموذج تسجيل الدخول المحلي (LoginForm) |
| `components/` | المشترك: DashboardLayout, RoleGuard, ErrorBoundary, LanguageSwitcher + `ui/` (shadcn) |
| `pages/` | صفحات رفيعة مربوطة بالمسارات في `App.tsx` |
| `lib/` | trpc client, i18n, utils |

## دومينات موجودة في المخطط بلا وحدة بعد (خارطة طريق)

| الدومين | الجداول في `drizzle/schema.ts` | ملاحظة |
|---|---|---|
| `payroll` | `payrollSheets`, `payrollDetails`, `overtimes` | عند البدء فيه: أنشئ `modules/payroll/` بنمط attendance |
| `requests` | `requests` | صفحة `Requests.tsx` موجودة بالواجهة — تحتاج وحدة خلفية |
| `worker-calendar` | `workerCalendar`, `dayTypes`, `overtimeReasons` | مرشّح للدمج مع schedules أو وحدة مستقلة |

## ملاحظات صيانة معلّقة

- `notifications` و`advanced-notifications`: راجعا لاحقًا — يوجد تداخل وظيفي محتمل، مرشّحان للدمج في router واحد.
- `incentives` و`advanced-incentives`: نفس الملاحظة.
- `workers.router.ts`: عمليات create/update/delete فيها placeholders (`return { success: true }`) بدون تنفيذ فعلي — تحتاج استكمال.
