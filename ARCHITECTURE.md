# معمارية المشروع — Modular Clean Architecture

> اقرأ هذا الملف قبل إضافة أي كود جديد. القواعد هنا هي اللي تحافظ على المشروع قابلًا للصيانة والتوسع.

## نظرة عامة

المشروع منظم كـ **Modular Monolith**: تطبيق واحد، لكن الكود مقسّم لوحدات (Modules) مستقلة حسب الدومين، وكل وحدة فيها طبقاتها الخاصة.

```
├── server/
│   ├── _core/                 ⛔ طبقة المنصة (Manus) — لا تعدّلها أبدًا
│   ├── shared/                🔧 مشترك حقيقي فقط (cross-cutting)
│   │   ├── db.ts              → اتصال قاعدة البيانات (getDb)
│   │   ├── audit.ts           → سجل التدقيق
│   │   ├── rbac.ts            → الصلاحيات والأدوار
│   │   └── storage.ts         → رفع/تنزيل الملفات (S3)
│   ├── modules/               📦 الوحدات — كل دومين في فولدر
│   │   └── <module>/
│   │       ├── <module>.router.ts       → tRPC (رفيع: validation + صلاحيات)
│   │       ├── <module>.service.ts      → منطق العمل (بدون tRPC وبدون SQL)
│   │       ├── <module>.repository.ts   → استعلامات DB فقط
│   │       └── <module>.*.test.ts       → اختبارات الوحدة بجانب كودها
│   ├── routers.ts             → Composition Root: تجميع routers فقط
│   └── db.ts                  ⚠️ Facade متوافق قديم — لا تضف عليه شيئًا
├── client/src/
│   ├── features/              📦 مكوّنات خاصة بدومين معيّن
│   │   └── <feature>/components/
│   ├── components/            → المشترك فقط (Layout, RoleGuard, ui/...)
│   ├── pages/                 → صفحات رفيعة تستدعي features
│   └── lib/, hooks/, contexts/→ أدوات عامة
├── drizzle/                   → المخطط (schema) والهجرات — مشترك بين الوحدات
└── shared/                    → ثوابت وأنواع مشتركة client/server
```

## الطبقات داخل الوحدة (Backend)

الطلب يمر بهذا الاتجاه فقط:

```
Client → Router → Service → Repository → Database
```

| الطبقة | مسؤوليتها | ممنوع فيها |
|---|---|---|
| **Router** | Zod validation، فحص الصلاحيات، تحويل أخطاء الـ Service إلى TRPCError | منطق عمل، SQL |
| **Service** | منطق العمل والقواعد (use cases) | أي شيء من tRPC، أي SQL مباشر |
| **Repository** | استعلامات Drizzle فقط | منطق عمل، صلاحيات |

**الوحدة المرجعية:** `server/modules/attendance/` مطبّقة بالطبقات الثلاث كاملة — انسخ نمطها عند بناء أي وحدة جديدة أو عند تكبير وحدة قائمة.

**قاعدة عملية للوحدات الصغيرة:** الوحدات البسيطة (CRUD مباشر) يكفيها router + repository. أنشئ service فقط عندما يظهر منطق عمل حقيقي (حسابات، قواعد، تحققات مركّبة) — ولا تكتب هذا المنطق داخل الـ router أبدًا.

## قواعد الاعتماد بين الوحدات (الأهم)

1. **ممنوع** استيراد أي ملف داخلي من وحدة ثانية مباشرة. لو وحدتك تحتاج شيئًا من وحدة أخرى، استورد من ملفها العام المعلن (حاليًا الـ repository، مثل `modules/notifications/notifications.repository.ts` لإرسال إشعار).
2. **ممنوع** كتابة استعلام على جدول يخص وحدة ثانية. مثال: لا تكتب `db.insert(notifications)` من وحدة incentives — استخدم `createNotification` من وحدة notifications.
3. `shared/` للمشترك الحقيقي فقط (db connection, rbac, audit, storage). لا تحوّله إلى سلة مهملات — أي شيء يخص دومين واحد مكانه وحدته.
4. `server/routers.ts` طبقة تجميع فقط — سطر واحد لكل وحدة، لا procedures فيه.

## ملفات التوافق (لا تبنِ عليها)

هذه الملفات موجودة فقط لأن `_core` (طبقة المنصة) يستورد منها، وستُحذف لو تغيّر ذلك:

- `server/db.ts` → يعيد التصدير من shared والـ repositories
- `server/storage.ts` → يعيد التصدير من `shared/storage.ts`
- `server/routers/scheduled-tasks.ts` → يعيد التصدير من الوحدة

**أي كود جديد يستورد من المواقع الفعلية مباشرة، وليس من هذه الملفات.**

## إضافة وحدة جديدة (Checklist)

1. أنشئ `server/modules/<name>/` بالملفات: `<name>.router.ts` (+ `<name>.repository.ts` إذا فيه جداول، + `<name>.service.ts` إذا فيه منطق عمل).
2. سجّل الـ router بسطر واحد في `server/routers.ts`.
3. أضف جداول الوحدة في `drizzle/schema.ts` ثم `pnpm db:push`.
4. للواجهة: أنشئ `client/src/features/<name>/components/` وصفحة رفيعة في `pages/`.
5. سجّل الوحدة في `MODULES.md` (السطر الخاص بها في الجدول).
6. اختبارات الوحدة تسكن بجانب كودها داخل فولدر الوحدة.

## إضافة عملية (procedure) جديدة على وحدة قائمة

1. الاستعلام → `<module>.repository.ts`
2. المنطق → `<module>.service.ts` (دالة جديدة مستقلة)
3. الـ endpoint → `<module>.router.ts` (validation + صلاحيات + استدعاء service)

## الأوامر

```bash
pnpm dev        # تشغيل التطوير
pnpm check      # فحص TypeScript (يجب أن يعدي قبل أي commit)
pnpm test       # الاختبارات (اختبارات DB تُتخطى تلقائيًا بدون DATABASE_URL)
pnpm build      # بناء الإنتاج
pnpm db:push    # توليد وتطبيق الهجرات
```

## قرارات معمارية (ADR مختصر)

| القرار | السبب |
|---|---|
| Modular Monolith وليس Microservices | حجم المشروع والفريق لا يبرر تعقيد البنية التحتية؛ الوحدات المستقلة تسمح بالفصل لاحقًا لو احتجنا |
| Service classes-free (دوال مصدّرة) | أبسط، وtRPC لا يحتاج DI container؛ لو احتجنا حقن تبعيات لاحقًا نضيفه تدريجيًا |
| `attendance` وحدة مرجعية كاملة الطبقات | نموذج يُحتذى بدل فرض 3 طبقات على وحدات CRUD بسيطة (تجنّب over-engineering) |
| إبقاء facades للتوافق مع `_core` | `_core` طبقة منصة قد يُعاد توليدها؛ لا نعدّل ملفاتها |
| المخطط (schema) مركزي في `drizzle/` | قيد من drizzle-kit؛ الجداول مقسمة بالتعليقات حسب الوحدة والوصول إليها محصور في repositories |

## نظام المصادقة المحلي (Local Auth)

مصادقة Manus OAuth **أُلغيت** واستُبدلت بنظام محلي كامل:

```
تسجيل الدخول:  Client → auth.login (email+password) → bcrypt verify
               → JWT جلسة (7 أيام) → كوكي httpOnly (app_session_id)
كل طلب لاحق:   _core/context.ts → authenticateRequest (auth.service)
               → يتحقق من JWT + isActive → ctx.user
```

| العنصر | الموقع |
|---|---|
| منطق المصادقة (bcrypt, JWT, الجلسات) | `server/modules/auth/auth.service.ts` |
| endpoints (login / me / logout / register) | `server/modules/auth/auth.router.ts` |
| نموذج وصفحة الدخول | `client/src/features/auth/` + `pages/Login.tsx` |
| إنشاء أول مسؤول | `pnpm seed:admin` (يقرأ ADMIN_EMAIL/ADMIN_PASSWORD من البيئة) |

**قواعد:**
- لا يوجد تسجيل ذاتي مفتوح — `register` محمي بصلاحية `USERS_CREATE` (المسؤولون فقط).
- رسالة فشل الدخول موحّدة عمدًا (لا نكشف هل البريد موجود).
- `passwordHash` لا يغادر السيرفر أبدًا (`toSafeUser` في الـ router).
- التعديلان الوحيدان داخل `_core` (موثّقان بتعليق `[LOCAL AUTH]`):
  `context.ts` (استبدال دالة المصادقة) و `index.ts` (تعطيل تسجيل مسارات OAuth).
  ملفات `oauth.ts` و `sdk.ts` باقية بلا استخدام — يمكن حذفها لاحقًا بأمان.
- في الواجهة `startLogin()` في `client/src/const.ts` صارت تنقل إلى `/login`
  بدل بوابة Manus — كل نقاط الاستدعاء القديمة تعمل بلا تعديل.

### خطوات التشغيل الأول
```bash
cp .env.example .env        # عدّل DATABASE_URL و JWT_SECRET
pnpm db:push                # إنشاء الجداول
ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm seed:admin
pnpm dev                    # ثم افتح /login
```
