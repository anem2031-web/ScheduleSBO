import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "wouter";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Timer,
  LogOut,
  MessageCircle,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { navigationForUser, isNavigationActive } from "@shared/navigation";
import { PERMISSION_CATALOG } from "@shared/access-control";
import { normalizeDigits } from "@shared/display-format";
import { ProductBrand } from "./ProductBrand";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useLanguage, type Language } from "@/lib/i18n";
import { permissionLabel } from "@/lib/permission-labels";

const icons = {
  today: Clock3,
  workers: Users,
  schedule: CalendarDays,
  whatsappDelivery: MessageCircle,
  overtime: Timer,
  reviews: CheckSquare,
  setup: Settings,
};
const roleLabels: Record<string, Record<Language, string>> = {
  admin: { ar: "مدير النظام", en: "Administrator", ur: "سسٹم ایڈمنسٹریٹر" },
  hr_admin: { ar: "الشؤون الإدارية", en: "Administration", ur: "انتظامیہ" },
  supervisor: { ar: "مشرف", en: "Supervisor", ur: "سپروائزر" },
  guard: { ar: "الحضور", en: "Attendance", ur: "حاضری" },
  worker: { ar: "عامل", en: "Worker", ur: "کارکن" },
  financial_reviewer: { ar: "المراجع المالي", en: "Financial reviewer", ur: "مالیاتی جائزہ کار" },
  finance: { ar: "المالية", en: "Finance", ur: "مالیات" },
  accounting_head: { ar: "رئيس الحسابات", en: "Head of accounts", ur: "سربراہ حسابات" },
  modifier: { ar: "مسؤول التعديلات", en: "Schedule editor", ur: "شیڈول ایڈیٹر" },
};

const navigationLabels: Record<string, Record<Language, string>> = {
  today: { ar: "اليوم", en: "Today", ur: "آج" },
  workers: { ar: "العمال", en: "Workers", ur: "کارکنان" },
  schedule: { ar: "الجدول الأسبوعي", en: "Weekly schedule", ur: "ہفتہ وار شیڈول" },
  whatsappDelivery: { ar: "متابعة رسائل واتساب", en: "WhatsApp delivery", ur: "واٹس ایپ پیغامات" },
  overtime: { ar: "العمل الإضافي", en: "Overtime", ur: "اضافی کام" },
  reviews: { ar: "المراجعات والاعتمادات", en: "Reviews and approvals", ur: "جائزے اور منظوری" },
  setup: { ar: "التهيئة", en: "Setup", ur: "ترتیبات" },
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user)
    return (
      <div
        dir={language === "en" ? "ltr" : "rtl"}
        className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
      >
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold">{text("سجّل الدخول للمتابعة", "Sign in to continue", "جاری رکھنے کے لیے سائن ان کریں")}</h1>
          <Button onClick={() => window.location.assign("/login")}>
            {text("تسجيل الدخول", "Sign in", "سائن ان")}
          </Button>
        </div>
      </div>
    );
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "15rem",
          "--sidebar-width-icon": "3.5rem",
        } as CSSProperties
      }
    >
      <WorkspaceLayout user={user}>{children}</WorkspaceLayout>
    </SidebarProvider>
  );
}

function WorkspaceLayout({
  children,
  user,
}: {
  children: ReactNode;
  user: { name?: string | null; role: string; permissions?: string[]; accessScope?: { costCenterIds: number[] } | null };
}) {
  const [location, navigate] = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { logout } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const roleLabel = roleLabels[user.role]?.[language] ?? user.role;
  const navLabel = (key: string, fallback: string) => key === "workers" && user.role === "supervisor"
    ? text("عمالي", "My workers", "میرے کارکنان")
    : navigationLabels[key]?.[language] ?? fallback;
  const expanded = state !== "collapsed" || isMobile;
  const items = navigationForUser(user);
  const active = items.find((item) => isNavigationActive(location, item.path));
  const go = (path: string) => {
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <div
      dir={language === "en" ? "ltr" : "rtl"}
      className="executive-theme flex min-h-screen w-full bg-background text-foreground"
    >
      <Sidebar
        side={language === "en" ? "left" : "right"}
        collapsible="icon"
        className="border-l border-border"
      >
        <SidebarHeader className="border-b border-border p-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-7 w-7 shrink-0 text-primary" />
            {expanded && (
              <div className="min-w-0 flex-1">
                <ProductBrand compact />
              </div>
            )}
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={text("إغلاق القائمة", "Close menu", "مینو بند کریں")}
                onClick={() => setOpenMobile(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <SidebarMenu className="gap-2">
            {items.map((item) => {
              const Icon = icons[item.key];
              const selected = isNavigationActive(location, item.path);
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={selected}
                    tooltip={navLabel(item.key, item.label)}
                    onClick={() => go(item.path)}
                    aria-current={selected ? "page" : undefined}
                    className="h-12 gap-3 rounded-xl px-3 text-sm"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>
                      {navLabel(item.key, item.label)}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-border p-3">
          {expanded && (
            <div className="mb-3 px-2">
              <p className="truncate text-sm font-semibold">
                {normalizeDigits(user.name || roleLabel)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {roleLabel}
              </p>
              {user.accessScope && <p className="mt-1 text-xs text-muted-foreground">{text("نطاق العمل", "Work scope", "کام کا دائرہ")}: {user.accessScope.costCenterIds.length} {text("مركز تكلفة", "cost centers", "لاگت کے مراکز")}</p>}
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">{text("صلاحياتي", "My permissions", "میری اجازتیں")}</summary><div className="mt-2 max-h-44 overflow-y-auto space-y-1">{user.permissions?.includes("*") ? text("جميع الصلاحيات", "All permissions", "تمام اجازتیں") : PERMISSION_CATALOG.filter(([code]) => user.permissions?.includes(code)).map(([code, , label]) => <p key={code}>{permissionLabel(code, label, language)}</p>)}</div></details>
            </div>
          )}
          <SidebarMenuButton
            tooltip={text("تسجيل الخروج", "Sign out", "سائن آؤٹ")}
            onClick={async () => {
              await logout();
              window.location.assign("/login");
            }}
            className="h-10"
          >
            <LogOut className="h-4 w-4" />
            <span>{text("تسجيل الخروج", "Sign out", "سائن آؤٹ")}</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger aria-label={text("فتح أو إغلاق القائمة", "Toggle menu", "مینو کھولیں یا بند کریں")} />
            <p className="truncate text-sm font-semibold">
              {active ? navLabel(active.key, active.label) : text("إدارة الدوام", "Schedule management", "شیڈول کا انتظام")}
            </p>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {roleLabel}
          </span>
          <LanguageSwitcher />
        </header>
        <div className="executive-page mx-auto w-full max-w-[1600px] min-w-0 p-4 pb-12 lg:p-6">
          {children}
          <footer className="product-footer"><ProductBrand compact /></footer>
        </div>
      </SidebarInset>
    </div>
  );
}
