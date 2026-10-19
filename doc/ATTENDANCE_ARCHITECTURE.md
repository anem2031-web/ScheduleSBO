# Attendance Architecture — معمارية الحضور والبصمة

تاريخ الاعتماد: 2026-08-09  
الحالة: **APPROVED DESIGN — IMPLEMENTATION PENDING**

---

## 1. الهدف

تطوير نظام الحضور بحيث يدعم بشكل احترافي وطويل المدى:

- جهاز بصمة ZKTeco عبر ADMS/Push.
- QR.
- تسجيل يدوي.
- أكثر من بصمة للعامل في نفس اليوم.
- خروج وعودة.
- أكثر من جلسة عمل خلال اليوم.
- أكثر من تكليف/وردية للعامل في نفس التاريخ عند الحاجة.
- تصحيحات إدارية مع اعتماد.
- الاحتفاظ بالبصمة الأصلية وعدم فقدانها بعد أي تعديل.
- منع تكرار أحداث الجهاز عند إعادة الإرسال.
- قابلية التدقيق الكامل Audit Trail.

---

## 2. القرار المعماري

الحضور يقسم إلى ثلاث طبقات مستقلة:

```text
ZKTeco / QR / Manual
        ↓
attendance_punches
        ↓
attendance_sessions
        ↓
attendance
```

ويستمر:

```text
attendance_corrections
```

كسجل للتصحيحات والاعتمادات.

---

## 3. attendance_punches — الأحداث الخام

هذا الجدول سيكون **مصدر الحقيقة الخام** لجميع أحداث الحضور.

كل بصمة/حدث يصل للنظام يُحفظ كسجل مستقل ولا يتم تحويله إلى سجل يومي مباشرة.

### أمثلة

```text
07:03 fingerprint IN
11:58 fingerprint OUT
12:40 fingerprint IN
15:12 fingerprint OUT
```

### الحقول المستهدفة مبدئيًا

```text
id
workerId
fingerprintId / externalWorkerCode عند الحاجة
punchTime
punchType
source
deviceId
externalEventId
receivedAt
rawPayload
createdAt
```

### source

القيم المستهدفة:

```text
fingerprint
qr
manual
system
```

### punchType

يفضل أن يدعم:

```text
in
out
unknown
```

ولا يجوز افتراض أن كل جهاز سيرسل دائمًا IN/OUT بشكل موثوق.

### قاعدة عدم التعديل

الأحداث الخام لا تُعدّل لتصحيح الحضور.

إذا عدّل المدير الحضور، تبقى بصمة الجهاز الأصلية محفوظة كما وصلت.

---

## 4. منع تكرار Push من الجهاز

جهاز ADMS/Push قد يعيد إرسال نفس الحدث.

لذلك يجب أن يحتوي `attendance_punches` على آلية Deduplication.

الخيار الأفضل عندما يوفر الجهاز معرف حدث ثابت:

```text
UNIQUE(deviceId, externalEventId)
```

إذا لم يوفر الجهاز معرفًا موثوقًا، يتم تصميم مفتاح بديل محسوب من مجموعة حقول بعد اختبار بيانات الجهاز الفعلية.

**لا يتم اعتماد مفتاح بديل قبل تجربة الجهاز الحقيقي.**

---

## 5. attendance_sessions — جلسات العمل

هذا الجدول يمثل الفترات الفعلية الناتجة عن تفسير البصمات.

مثال:

```text
Session 1: 07:03 → 11:58
Session 2: 12:40 → 15:12
```

### الحقول المستهدفة مبدئيًا

```text
id
workerId
attendanceDate
shiftAssignmentId
checkInPunchId
checkOutPunchId
checkInTime
checkOutTime
workedMinutes
status
createdAt
updatedAt
```

### الربط بالجدول

الأفضل أن ترتبط الجلسة بـ:

```text
shiftAssignmentId
```

عند إمكانية تحديد التكليف المسؤول عن الجلسة.

هذا يمنع افتراض أن العامل لديه وردية واحدة فقط في اليوم.

---

## 6. attendance — الملخص اليومي

الجدول الحالي `attendance` يعتمد مستقبلاً كـ:

```text
Daily Attendance Summary
```

وليس كمخزن للأحداث الخام.

### مسؤوليته

صف واحد لكل عامل في يوم العمل يحتوي الملخص النهائي مثل:

```text
workerId
attendanceDate
firstCheckIn
lastCheckOut
actualHours
status
lateMinutes
earlyLeaveMinutes
overtimeMinutes
notes
```

الحقول الجديدة لا تتم إضافتها الآن؛ هذه مواصفة اتجاهية فقط حتى تتم مراجعة الكود الحالي.

### القيد الفريد المستهدف

بعد تثبيت أن هذا الجدول Daily Summary:

```text
UNIQUE(workerId, attendanceDate)
```

يصبح قيدًا صحيحًا ومطلوبًا.

### الحالة الحالية

قاعدة البيانات الحالية تحتوي فقط:

```text
INDEX attendance_worker_date_idx(workerId, attendanceDate)
```

ولا تحتوي `UNIQUE`.

كما تم التحقق أن البيانات الحالية لا تحتوي سجلات مكررة.

### قرار التنفيذ

**لا يضاف UNIQUE الآن** حتى يتم تنفيذ طبقة `attendance_punches`/`attendance_sessions` أو تثبيت انتقال آمن يحافظ على السلوك الحالي.

---

## 7. attendance_corrections — التصحيحات

يبقى جدول `attendance_corrections` مسؤولًا عن الأثر التاريخي للتعديل.

تم التحقق تشغيليًا أنه يحتفظ بالقيم الأصلية:

```text
originalCheckIn
originalCheckOut
```

وبالقيم المصححة:

```text
correctedCheckIn
correctedCheckOut
```

مع:

```text
reason
correctedBy
approvedBy
approvedAt
```

### قاعدة مهمة

أي تصحيح إداري لا يحذف أو يغير `attendance_punches`.

التصحيح يؤثر على الجلسة/الملخص المعتمد فقط مع الاحتفاظ بالأثر التاريخي.

---

## 8. تسلسل معالجة حدث جهاز بصمة مستقبلاً

```text
1. ADMS/Push يستقبل الحدث
2. التحقق من الجهاز
3. تحديد العامل
4. Deduplicate
5. حفظ الحدث في attendance_punches
6. تفسير IN/OUT
7. إنشاء/تحديث attendance_session
8. ربط الجلسة بـ shiftAssignment إن أمكن
9. إعادة حساب attendance daily summary
10. حساب late/early_leave/overtime
11. تسجيل Audit عند الحاجة
```

الحفظ الخام يسبق الحساب دائمًا.

---

## 9. التعامل مع IN/OUT

لا يعتمد النظام المستقبلي بالكامل على أن العامل يحدد يدويًا "دخول" أو "خروج".

يمكن الاستفادة من نوع الحدث القادم من الجهاز إذا كان موثوقًا.

لكن يجب أن يدعم النظام:

```text
unknown punch
```

حتى يمكن تفسير الأحداث وفق ترتيبها والجلسة الحالية عند الحاجة.

---

## 10. قواعد عدم فقدان البيانات

1. لا حذف لبصمة خام بسبب تعديل إداري.
2. لا استبدال لبصمة خام بقيمة مصححة.
3. كل حدث جهاز يحتفظ بوقت الحدث ووقت وصوله.
4. التصحيحات تسجل من قام بها ومن اعتمدها.
5. الملخص اليومي يمكن إعادة حسابه من الجلسات.
6. الجلسات يمكن إعادة بنائها من الأحداث الخام قدر الإمكان.
7. أي إعادة معالجة يجب أن تكون Idempotent.

---

## 11. أثر التصميم على ما تم إنجازه

الإصلاحات الحالية تبقى صالحة:

```text
Daily attendance display
Late detection from shift_assignments
Check-out
actualHours
Corrections
Approval
Audit history
```

ولا يتم هدمها.

التطوير الجديد يبنى حولها تدريجيًا.

---

## 12. خطة التنفيذ

### Phase A — مراجعة الكود الحالي

```text
attendance.repository.ts
attendance.service.ts
attendance.router.ts
Attendance.tsx
schema.ts
```

الحالة:

```text
PENDING
```

### Phase B — تصميم Schema تفصيلي

```text
attendance_punches
attendance_sessions
device registry / device mapping إذا لزم
```

الحالة:

```text
NOT STARTED
```

### Phase C — Migration

تنفذ فقط بعد:

```text
Schema review
Manual DB review
Regression impact review
Backup/rollback plan
```

الحالة:

```text
NOT STARTED
```

### Phase D — Ingestion API / ADMS

يتم تنفيذه بعد توفر جهاز حقيقي أو بيانات Push نموذجية مؤكدة.

الحالة:

```text
NOT STARTED
```

---

## 13. قرارات مؤجلة

لا نقرر بعد:

- الشكل النهائي لـ `externalEventId`.
- صيغة Raw Payload لجهاز ZKTeco.
- هل `punchType` يثق بقيمة الجهاز أو يعاد تفسيره.
- سياسة الجلسة المفتوحة بدون OUT.
- سياسة ورديات منتصف الليل مع تعدد الجلسات.
- كيفية دمج QR والبصمة في نفس الجلسة عند التعارض.

هذه القرارات تحتاج بيانات الجهاز الفعلية.

---

## 14. الحالة النهائية لهذا القرار

```text
Architecture decision: APPROVED
Documentation: COMPLETED
Database changes: NOT APPLIED
Code changes: NOT APPLIED
Regression risk introduced: NONE
```
