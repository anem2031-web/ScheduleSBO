# تجربة واتساب برقم الشركة

هذه الإعدادات لتجربة خمسة أرقام كحد أقصى في وردية، وليست إعدادًا لإرسال جداول جميع العمال.

## قبل التشغيل

- ارفع الكود وانشره يدويًا بعد المراجعة.
- جهز جدول الحالة بتطبيق SQL في `drizzle/0010_whatsapp_trial_schedule_state.sql` على قاعدة البيانات المقصودة بعد مراجعة صلاحياتها. هذا الملف ليس مسجلاً في سجل هجرات Drizzle الحالي، ولن يُطبق تلقائيًا بمجرد النشر.
- تأكد من اعتماد قالبي `wardia_weekly_schedule` (21 متغيرًا) و`wardia_schedule_update` (5 متغيرات) داخل حساب مراسلة رقم الشركة، وإعداد طريقة الدفع إذا طلبتها Meta.
- يحتفظ التطبيق بآخر بيانات قبلتها Meta، وليس إثبات التسليم للهاتف. أوقف التجربة عند ظهور حالة تتطلب مراجعة، ولا تمسح حالة الإرسال لإعادة المحاولة قبل التحقق من المستلم.
- تجربة الشركة الأولى يجب أن تبدأ برسالة أسبوعية جديدة؛ الرسائل التي أُرسلت سابقًا من رقم Meta التجريبي ليس لها سجل مقارنة في جدول الحالة الجديد.

## متغيرات Railway المقترحة للتجهيز دون تشغيل الإرسال التلقائي

```dotenv
WHATSAPP_TRIAL_ENABLED=false
WHATSAPP_TRIAL_AUTO_SEND=false
WHATSAPP_TRIAL_DELIVERY_MODE=schedule
WHATSAPP_TRIAL_PHONE_NUMBER_ID=1567827306422777
WHATSAPP_TRIAL_ACCESS_TOKEN=<يوضع سرًا في Railway>
WHATSAPP_TRIAL_RECIPIENTS=+966570344919,+966550931212,+966502202734
WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_NAME=wardia_weekly_schedule
WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_VARIABLES=21
WHATSAPP_TRIAL_SCHEDULE_TEMPLATE_APPROVED=true
WHATSAPP_TRIAL_UPDATE_TEMPLATE_NAME=wardia_schedule_update
WHATSAPP_TRIAL_UPDATE_TEMPLATE_APPROVED=true
```

لا تعرض رمز الوصول في المحادثة أو الصور أو Git. ظهرت حالة القالبين `Active - Quality pending` في حساب الرقم الجديد؛ تحقق من استمرارها عند إدخال علامات الاعتماد. تبقى `WHATSAPP_TRIAL_ENABLED` و`WHATSAPP_TRIAL_AUTO_SEND` بقيمة `false` أثناء التجهيز. لا تفعّل الإرسال حتى تُراجع الهجرة وتُختبر التجربة على قاعدة بيانات تجريبية مستقلة، ثم بعد تهيئة متغيرات Meta بالكامل. عند تشغيل الإرسال، يرسل التطبيق إلى أرقام القائمة المحددة فقط، وتتطلب التعديلات إعادة اعتماد الأسبوع.

قالب Meta يقبل حتى فترتين في اليوم في تصميمه الحالي؛ إذا وُجدت أكثر من فترتين، يتوقف إرسال جدول ذلك العامل بدل حذف فترات من الرسالة. يظهر الرمز `—` عند غياب الفترة الثانية.
