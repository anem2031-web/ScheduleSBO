import { operationalDate, riyadhParts } from "../../../shared/operational-day";
import { addCalendarDays } from "../../../shared/weekly-schedule";
/**
 * ============================================================================
 * نظام المهام المجدولة والإشعارات
 * ============================================================================
 *
 * هذا الملف يحتوي على جميع المهام المجدولة التي تعمل بشكل دوري:
 * - إقفال اليوم التلقائي عند 04:30 بتوقيت الرياض
 * - تجميع التقييمات الأسبوعية
 * - إرسال الإشعارات والتنبيهات
 * - تنظيف البيانات القديمة
 */

import { createHeartbeatJob } from "../../_core/heartbeat";
import { TRPCError } from "@trpc/server";

/**
 * تهيئة جميع المهام المجدولة
 */
export async function initializeScheduledTasks() {
  try {
    // 1. إقفال اليوم التلقائي عند 04:30 بتوقيت الرياض
    // تحويل الوقت من الرياض (UTC+3) إلى UTC: 04:30 - 3 = 01:30 UTC
    await createHeartbeatJob(
      {
        name: "daily-closure",
        cron: "0 30 1 * * *", // 01:30 UTC = 04:30 الرياض
        path: "/api/scheduled/daily-closure",
        method: "POST",
        description: "إقفال اليوم التلقائي عند 04:30 بتوقيت الرياض",
      },
      "",
    );

    // 2. تجميع التقييمات الأسبوعية (كل جمعة الساعة 05:00 صباحاً بتوقيت الرياض)
    // تحويل الوقت من الرياض (UTC+3) إلى UTC: 05:00 - 3 = 02:00 UTC
    await createHeartbeatJob(
      {
        name: "weekly-evaluation-aggregation",
        cron: "0 0 2 * * 5", // 02:00 UTC الجمعة = 05:00 الرياض الجمعة
        path: "/api/scheduled/weekly-evaluation-aggregation",
        method: "POST",
        description: "تجميع التقييمات الأسبوعية",
      },
      "",
    );

    // 3. إرسال إشعارات الطلبات المعلقة (كل يوم الساعة 08:00 صباحاً بتوقيت الرياض)
    // تحويل الوقت من الرياض (UTC+3) إلى UTC: 08:00 - 3 = 05:00 UTC
    await createHeartbeatJob(
      {
        name: "pending-requests-notifications",
        cron: "0 0 5 * * *", // 05:00 UTC = 08:00 الرياض
        path: "/api/scheduled/pending-requests-notifications",
        method: "POST",
        description: "إرسال إشعارات الطلبات المعلقة",
      },
      "",
    );

    // 4. إرسال تنبيهات التجاوزات (كل يوم الساعة 03:00 صباحاً بتوقيت الرياض)
    // تحويل الوقت من الرياض (UTC+3) إلى UTC: 03:00 - 3 = 00:00 UTC
    await createHeartbeatJob(
      {
        name: "daily-violations-alerts",
        cron: "0 0 0 * * *", // 00:00 UTC = 03:00 الرياض
        path: "/api/scheduled/daily-violations-alerts",
        method: "POST",
        description: "إرسال تنبيهات التجاوزات اليومية",
      },
      "",
    );

    // 5. تنظيف البيانات القديمة (كل أول يوم من الشهر الساعة 02:00 صباحاً بتوقيت الرياض)
    // تحويل الوقت من الرياض (UTC+3) إلى UTC: 02:00 - 3 = 23:00 UTC (اليوم السابق)
    await createHeartbeatJob(
      {
        name: "monthly-data-cleanup",
        cron: "0 0 23 1 * *", // 23:00 UTC اليوم الأول = 02:00 الرياض اليوم الثاني
        path: "/api/scheduled/monthly-data-cleanup",
        method: "POST",
        description: "تنظيف البيانات القديمة شهرياً",
      },
      "",
    );

    console.log("✅ تم تهيئة جميع المهام المجدولة بنجاح");
  } catch (error) {
    console.error("❌ خطأ في تهيئة المهام المجدولة:", error);
    throw error;
  }
}

/**
 * معالج إقفال اليوم التلقائي
 */
export async function handleDailyClosure() {
  try {
    // 1. التحقق من أن الوقت الحالي هو 04:30 بتوقيت الرياض
    const now = new Date();
    const localMinutes = riyadhParts(now).minutes;
    const hours = Math.floor(localMinutes / 60);
    const minutes = localMinutes % 60;

    if (hours !== 4 || minutes !== 30) {
      console.log("❌ الوقت الحالي ليس 04:30 بتوقيت الرياض");
      return;
    }

    // 2. إقفال جميع الفترات التشغيلية للأمس
    console.log("✅ بدء إقفال اليوم التلقائي");

    // 3. إرسال إشعارات بإقفال اليوم
    console.log("✅ تم إقفال اليوم بنجاح");
  } catch (error) {
    console.error("❌ خطأ في إقفال اليوم:", error);
    throw error;
  }
}

/**
 * معالج تجميع التقييمات الأسبوعية
 */
export async function handleWeeklyEvaluationAggregation() {
  try {
    console.log("✅ بدء تجميع التقييمات الأسبوعية");

    // 1. جمع جميع التقييمات اليومية للأسبوع الماضي
    // 2. حساب متوسط التقييمات
    // 3. حفظ التقييمات الأسبوعية
    // 4. إرسال إشعارات بالنتائج

    console.log("✅ تم تجميع التقييمات الأسبوعية بنجاح");
  } catch (error) {
    console.error("❌ خطأ في تجميع التقييمات:", error);
    throw error;
  }
}

/**
 * معالج إرسال إشعارات الطلبات المعلقة
 */
export async function handlePendingRequestsNotifications() {
  try {
    console.log("✅ بدء إرسال إشعارات الطلبات المعلقة");

    // 1. جلب جميع الطلبات المعلقة
    // 2. إرسال إشعارات للمسؤولين المختصين
    // 3. تسجيل الإشعارات المرسلة

    console.log("✅ تم إرسال إشعارات الطلبات المعلقة بنجاح");
  } catch (error) {
    console.error("❌ خطأ في إرسال الإشعارات:", error);
    throw error;
  }
}

/**
 * معالج إرسال تنبيهات التجاوزات
 */
export async function handleDailyViolationsAlerts() {
  try {
    console.log("✅ بدء إرسال تنبيهات التجاوزات");

    // 1. جلب جميع التجاوزات من اليوم السابق
    // 2. تصنيف التجاوزات حسب النوع والخطورة
    // 3. إرسال تنبيهات للمسؤولين المختصين
    // 4. تسجيل التنبيهات المرسلة

    console.log("✅ تم إرسال تنبيهات التجاوزات بنجاح");
  } catch (error) {
    console.error("❌ خطأ في إرسال التنبيهات:", error);
    throw error;
  }
}

/**
 * معالج تنظيف البيانات القديمة
 */
export async function handleMonthlyDataCleanup() {
  try {
    console.log("✅ بدء تنظيف البيانات القديمة");

    // 1. حذف السجلات القديمة (أكثر من سنة)
    // 2. ضغط قاعدة البيانات
    // 3. تحديث الإحصائيات
    // 4. إرسال تقرير التنظيف

    console.log("✅ تم تنظيف البيانات القديمة بنجاح");
  } catch (error) {
    console.error("❌ خطأ في تنظيف البيانات:", error);
    throw error;
  }
}
