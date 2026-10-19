import { permits } from "./access-control";
/** Primary tasks, shared by the sidebar and its regression tests. */
export const primaryNavigation = [
  {
    key: "today",
    label: "اليوم",
    path: "/dashboard",
    roles: [
      "admin",
      "hr_admin",
      "supervisor",
      "guard",
      "worker",
      "financial_reviewer",
      "finance",
      "accounting_head",
      "modifier",
    ],
  },
  {
    key: "workers",
    label: "العمال",
    path: "/workers",
    roles: ["admin", "hr_admin", "supervisor"],
  },
  {
    key: "schedule",
    label: "الجدول الأسبوعي",
    path: "/schedules",
    roles: ["admin", "hr_admin", "supervisor", "modifier"],
  },
  {
    key: "overtime",
    label: "العمل الإضافي",
    path: "/overtime",
    roles: ["admin", "hr_admin", "supervisor", "modifier"],
  },
  {
    key: "reviews",
    label: "المراجعات والاعتمادات",
    path: "/requests",
    roles: ["admin", "hr_admin", "supervisor", "modifier"],
  },
  {
    key: "setup",
    label: "التهيئة",
    path: "/settings",
    roles: ["admin", "hr_admin"],
  },
] as const;
export function navigationForRole(role: string) {
  return primaryNavigation.filter((item) =>
    (item.roles as readonly string[]).includes(role),
  );
}
export function navigationForUser(user: { role: string; permissions?: string[] }) {
  const candidates = primaryNavigation.filter((item) =>
    (item.roles as readonly string[]).includes(user.role) ||
    (item.key === "overtime" && user.permissions !== undefined && permits(user.permissions, "overtime:read")),
  );
  if (user.role === "admin" || user.permissions === undefined) return candidates;
  const any = (...codes: string[]) => codes.some(code => permits(user.permissions ?? [], code));
  return candidates.filter(item => {
    switch (item.key) {
      case "today": return true;
      case "workers": return any("workers:read");
      case "schedule": return any("schedule:read");
      case "overtime": return any("overtime:read");
      case "reviews": return any("attendance:read", "attendance:approve", "leave:read");
      case "setup": return any("org_structure:read", "users:read", "workers:create");
    }
  });
}
export function isNavigationActive(currentPath: string, target: string) {
  const path = currentPath.split(/[?#]/)[0];
  if (target === "/dashboard")
    return (
      path === "/dashboard" ||
      path.endsWith("-dashboard") ||
      path === "/attendance" ||
      path === "/payroll" ||
      path === "/reports"
    );
  if (target === "/workers" && path === "/worker-hub") return true;
  return path === target || path.startsWith(`${target}/`);
}
