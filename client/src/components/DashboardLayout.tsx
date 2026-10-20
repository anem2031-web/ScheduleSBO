import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "wouter";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Timer,
  LogOut,
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

const icons = {
  today: Clock3,
  workers: Users,
  schedule: CalendarDays,
  overtime: Timer,
  reviews: CheckSquare,
  setup: Settings,
};
const roleLabels: Record<string, string> = {
  admin: "مدير النظام",
  hr_admin: "الشؤون الإدارية",
  supervisor: "مشرف",
  guard: "الحضور",
  worker: "عامل",
  financial_reviewer: "المراجع المالي",
  finance: "المالية",
  accounting_head: "رئيس الحسابات",
  modifier: "مسؤول التعديلات",
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user)
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
      >
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold">سجّل الدخول للمتابعة</h1>
          <Button onClick={() => window.location.assign("/login")}>
            تسجيل الدخول
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
  const expanded = state !== "collapsed" || isMobile;
  const items = navigationForUser(user);
  const active = items.find((item) => isNavigationActive(location, item.path));
  const go = (path: string) => {
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <div
      dir="rtl"
      className="executive-theme flex min-h-screen w-full bg-background text-foreground"
    >
      <Sidebar
        side="right"
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
                aria-label="إغلاق القائمة"
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
                    tooltip={item.label}
                    onClick={() => go(item.path)}
                    aria-current={selected ? "page" : undefined}
                    className="h-12 gap-3 rounded-xl px-3 text-sm"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>
                      {item.key === "workers" && user.role === "supervisor"
                        ? "عمالي"
                        : item.label}
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
                {normalizeDigits(user.name || roleLabels[user.role] || "")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {roleLabels[user.role]}
              </p>
              {user.accessScope && <p className="mt-1 text-xs text-muted-foreground">نطاق العمل: {user.accessScope.costCenterIds.length} مركز تكلفة</p>}
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">صلاحياتي</summary><div className="mt-2 max-h-44 overflow-y-auto space-y-1">{user.permissions?.includes("*") ? "جميع الصلاحيات" : PERMISSION_CATALOG.filter(([code]) => user.permissions?.includes(code)).map(([code, , label]) => <p key={code}>{label}</p>)}</div></details>
            </div>
          )}
          <SidebarMenuButton
            tooltip="تسجيل الخروج"
            onClick={async () => {
              await logout();
              window.location.assign("/login");
            }}
            className="h-10"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger aria-label="فتح أو إغلاق القائمة" />
            <p className="truncate text-sm font-semibold">
              {active?.label || "إدارة الدوام"}
            </p>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {roleLabels[user.role]}
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
