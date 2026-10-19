/**
 * نظام الترجمة الذكية
 * دعم اللغات: العربية، الإنجليزية، الأردية
 */

import { displayLanguage, normalizeDigits } from "@shared/display-format";

export type Language = "ar" | "en" | "ur";

export interface TranslationStrings {
  [key: string]: {
    ar: string;
    en: string;
    ur: string;
  };
}

// قاموس الترجمات الشامل
export const translations: TranslationStrings = {
  // الملاحة الرئيسية
  "nav.dashboard": {
    ar: "لوحة التحكم",
    en: "Dashboard",
    ur: "ڈیش بورڈ",
  },
  "nav.workers": {
    ar: "الموظفين",
    en: "Workers",
    ur: "کارکنان",
  },
  "nav.attendance": {
    ar: "الحضور",
    en: "Attendance",
    ur: "حاضری",
  },
  "nav.payroll": {
    ar: "الرواتب",
    en: "Payroll",
    ur: "تنخواہ",
  },
  "nav.evaluations": {
    ar: "التقييمات",
    en: "Evaluations",
    ur: "تشخیص",
  },
  "nav.incentives": {
    ar: "الحوافز",
    en: "Incentives",
    ur: "ترغیبات",
  },
  "nav.requests": {
    ar: "الطلبات",
    en: "Requests",
    ur: "درخواستیں",
  },
  "nav.reports": {
    ar: "التقارير",
    en: "Reports",
    ur: "رپورٹس",
  },
  "nav.analytics": {
    ar: "التحليلات",
    en: "Analytics",
    ur: "تجزیہ",
  },
  "nav.settings": {
    ar: "الإعدادات",
    en: "Settings",
    ur: "سیٹنگز",
  },

  // الأزرار العامة
  "btn.add": {
    ar: "إضافة",
    en: "Add",
    ur: "شامل کریں",
  },
  "btn.edit": {
    ar: "تعديل",
    en: "Edit",
    ur: "ترمیم کریں",
  },
  "btn.delete": {
    ar: "حذف",
    en: "Delete",
    ur: "حذف کریں",
  },
  "btn.save": {
    ar: "حفظ",
    en: "Save",
    ur: "محفوظ کریں",
  },
  "btn.cancel": {
    ar: "إلغاء",
    en: "Cancel",
    ur: "منسوخ کریں",
  },
  "btn.submit": {
    ar: "إرسال",
    en: "Submit",
    ur: "جمع کریں",
  },
  "btn.approve": {
    ar: "موافقة",
    en: "Approve",
    ur: "منظوری دیں",
  },
  "btn.reject": {
    ar: "رفض",
    en: "Reject",
    ur: "مسترد کریں",
  },
  "btn.export": {
    ar: "تصدير",
    en: "Export",
    ur: "برآمد کریں",
  },
  "btn.search": {
    ar: "بحث",
    en: "Search",
    ur: "تلاش کریں",
  },

  // الرسائل والإشعارات
  "msg.success": {
    ar: "تم بنجاح",
    en: "Success",
    ur: "کامیاب",
  },
  "msg.error": {
    ar: "خطأ",
    en: "Error",
    ur: "خرابی",
  },
  "msg.warning": {
    ar: "تحذير",
    en: "Warning",
    ur: "انتباہ",
  },
  "msg.info": {
    ar: "معلومة",
    en: "Information",
    ur: "معلومات",
  },
  "msg.loading": {
    ar: "جاري التحميل...",
    en: "Loading...",
    ur: "لوڈ ہو رہا ہے...",
  },
  "msg.noData": {
    ar: "لا توجد بيانات",
    en: "No data",
    ur: "کوئی ڈیٹا نہیں",
  },

  // جداول وأعمدة
  "table.id": {
    ar: "الرقم",
    en: "ID",
    ur: "شناخت",
  },
  "table.name": {
    ar: "الاسم",
    en: "Name",
    ur: "نام",
  },
  "table.email": {
    ar: "البريد الإلكتروني",
    en: "Email",
    ur: "ای میل",
  },
  "table.phone": {
    ar: "الهاتف",
    en: "Phone",
    ur: "فون",
  },
  "table.department": {
    ar: "القسم",
    en: "Department",
    ur: "شعبہ",
  },
  "table.position": {
    ar: "الوظيفة",
    en: "Position",
    ur: "عہدہ",
  },
  "table.salary": {
    ar: "الراتب",
    en: "Salary",
    ur: "تنخواہ",
  },
  "table.status": {
    ar: "الحالة",
    en: "Status",
    ur: "حالت",
  },
  "table.date": {
    ar: "التاريخ",
    en: "Date",
    ur: "تاریخ",
  },
  "table.actions": {
    ar: "الإجراءات",
    en: "Actions",
    ur: "اقدامات",
  },

  // حالات الموظفين
  "status.active": {
    ar: "نشط",
    en: "Active",
    ur: "فعال",
  },
  "status.inactive": {
    ar: "غير نشط",
    en: "Inactive",
    ur: "غیر فعال",
  },
  "status.onLeave": {
    ar: "في إجازة",
    en: "On Leave",
    ur: "چھٹی پر",
  },
  "status.suspended": {
    ar: "معلق",
    en: "Suspended",
    ur: "معطل",
  },

  // حالات الطلبات
  "requestStatus.pending": {
    ar: "قيد الانتظار",
    en: "Pending",
    ur: "زیرِ التوقع",
  },
  "requestStatus.approved": {
    ar: "موافق عليه",
    en: "Approved",
    ur: "منظور",
  },
  "requestStatus.rejected": {
    ar: "مرفوض",
    en: "Rejected",
    ur: "مسترد",
  },
  "requestStatus.processing": {
    ar: "قيد المعالجة",
    en: "Processing",
    ur: "کارروائی میں",
  },

  // الأدوار
  "role.admin": {
    ar: "مدير النظام",
    en: "Administrator",
    ur: "منتظم",
  },
  "role.hrAdmin": {
    ar: "شؤون إدارية",
    en: "HR Admin",
    ur: "ایچ آر انتظامیہ",
  },
  "role.supervisor": {
    ar: "مشرف",
    en: "Supervisor",
    ur: "نگران",
  },
  "role.guard": {
    ar: "حارس",
    en: "Guard",
    ur: "محافظ",
  },
  "role.worker": {
    ar: "عامل",
    en: "Worker",
    ur: "کارکن",
  },
  "role.financeReviewer": {
    ar: "مراجع مالي",
    en: "Finance Reviewer",
    ur: "مالیاتی جائزہ کار",
  },
  "role.finance": {
    ar: "مالية",
    en: "Finance",
    ur: "مالیات",
  },
  "role.accountant": {
    ar: "رئيس حسابات",
    en: "Accountant",
    ur: "اکاؤنٹنٹ",
  },
  "role.auditor": {
    ar: "معدل",
    en: "Auditor",
    ur: "آڈیٹر",
  },

  // الأشهر
  "month.january": {
    ar: "يناير",
    en: "January",
    ur: "جنوری",
  },
  "month.february": {
    ar: "فبراير",
    en: "February",
    ur: "فروری",
  },
  "month.march": {
    ar: "مارس",
    en: "March",
    ur: "مارچ",
  },
  "month.april": {
    ar: "أبريل",
    en: "April",
    ur: "اپریل",
  },
  "month.may": {
    ar: "مايو",
    en: "May",
    ur: "مئی",
  },
  "month.june": {
    ar: "يونيو",
    en: "June",
    ur: "جون",
  },
  "month.july": {
    ar: "يوليو",
    en: "July",
    ur: "جولائی",
  },
  "month.august": {
    ar: "أغسطس",
    en: "August",
    ur: "اگست",
  },
  "month.september": {
    ar: "سبتمبر",
    en: "September",
    ur: "ستمبر",
  },
  "month.october": {
    ar: "أكتوبر",
    en: "October",
    ur: "اکتوبر",
  },
  "month.november": {
    ar: "نوفمبر",
    en: "November",
    ur: "نومبر",
  },
  "month.december": {
    ar: "ديسمبر",
    en: "December",
    ur: "دسمبر",
  },
};

/**
 * دالة الترجمة الرئيسية
 */
export function t(key: string, language: Language): string {
  const parts = key.split(".");
  let current: any = translations;

  for (const part of parts) {
    if (current[part]) {
      current = current[part];
    } else {
      return key; // إرجاع المفتاح إذا لم توجد الترجمة
    }
  }

  if (typeof current === "object" && current[language]) {
    return normalizeDigits(current[language]);
  }

  return key;
}

/**
 * Hook للحصول على اللغة الحالية
 */
import React from "react";

export function useLanguage() {
  const [language, setLanguage] = React.useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return (saved as Language) || "ar";
  });

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
    document.documentElement.lang = displayLanguage(lang);
    document.documentElement.dir =
      lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  };

  React.useEffect(() => {
    document.documentElement.lang = displayLanguage(language);
    document.documentElement.dir =
      language === "ar" || language === "ur" ? "rtl" : "ltr";
  }, [language]);

  return { language, changeLanguage };
}

/**
 * دالة مساعدة للترجمة المباشرة
 */
export function translate(key: string, language: Language): string {
  return t(key, language);
}
