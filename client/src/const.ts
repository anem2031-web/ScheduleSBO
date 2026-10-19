export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * [LOCAL AUTH] استُبدل تحويل Manus OAuth بصفحة تسجيل دخول محلية.
 * كل نقاط الاستدعاء القديمة (useAuth, DashboardLayout, main.tsx) تعمل كما هي —
 * الفرق الوحيد أن التحويل صار إلى /login داخل التطبيق.
 */
export const startLogin = () => {
  if (window.location.pathname === "/login") return;
  window.location.href = "/login";
};
