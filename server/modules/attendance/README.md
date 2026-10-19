# وحدة الحضور — Attendance (الوحدة المرجعية ⭐)

هذه الوحدة مطبّقة بالطبقات الثلاث كاملة. **انسخ نمطها** عند بناء أي وحدة جديدة.

## الملفات

| الملف | الدور |
|---|---|
| `attendance.router.ts` | tRPC — رفيع: Zod validation + فحص صلاحيات + استدعاء الـ service وتحويل أخطائه إلى `TRPCError` |
| `attendance.service.ts` | منطق العمل (use cases): check-in/out، التصحيحات، الغياب، الإحصائيات. لا يعرف tRPC ولا SQL |
| `attendance.repository.ts` | استعلامات Drizzle فقط على جداول `attendance`, `attendance_corrections`, `shifts` |
| `attendance.service.test.ts` | اختبارات وحدة للمنطق الصافي (تعمل بدون قاعدة بيانات) |
| `attendance.test.ts` | اختبارات تكامل (تُتخطى تلقائيًا بدون `DATABASE_URL`) |

## تدفق الطلب

```
recordCheckIn (router)
  → صلاحية ATTENDANCE_RECORD؟
  → service.recordCheckIn()
      → repo.findByWorkerAndDate()   هل سجّل اليوم؟
      → repo.getDefaultShift()       حساب دقائق التأخير
      → repo.insertAttendance()
      → createAuditLog()             (shared)
```

## معالجة الأخطاء

الـ service يرمي `AttendanceError` بكود (`NOT_FOUND` | `BAD_REQUEST`) —
والـ router يحوّله عبر `toTrpcError()`. لا ترمِ `TRPCError` من داخل service أبدًا.

## لإضافة عملية جديدة

1. الاستعلام في `attendance.repository.ts`
2. المنطق دالة جديدة في `attendance.service.ts` (+ اختبار في `attendance.service.test.ts`)
3. الـ endpoint في `attendance.router.ts`
