import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  UserRoundPlus,
  ArrowLeft,
  Loader2,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { OrgSetup } from "@/components/setup/OrgSetup";
import {
  JobTitlesCard,
  SimpleCatalogCard,
  UsersTab,
} from "@/components/setup/SetupManagement";
import { Link } from "wouter";
import { permits } from "@shared/access-control";

type SetupSection = "structure" | "supervisors" | "workers";
const SETUP_SECTIONS = [
  {
    id: "structure",
    label: "الهيكل التشغيلي",
    description: "مراكز التكلفة والمواقع والأقسام",
    icon: Building2,
  },
  {
    id: "supervisors",
    label: "المشرفون",
    description: "حسابات المشرفين وصلاحياتهم",
    icon: Users,
  },
  {
    id: "workers",
    label: "العمال",
    description: "رفع الأسماء وإكمال الارتباطات",
    icon: UserRoundPlus,
  },
] as const;

export default function Settings() {
  const { user, loading } = useAuth();
  const [section, setSection] = useState<SetupSection>("structure");
  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      new URLSearchParams(window.location.search).get("section") ===
      "job-titles",
  );
  const canStructure = permits(user?.permissions ?? [], "org_structure:read");
  const canAccounts = permits(user?.permissions ?? [], "users:read");
  const allowed = (user?.role === "admin" || user?.role === "hr_admin") && (canStructure || canAccounts || permits(user?.permissions ?? [], "workers:create"));
  useEffect(() => {
    if (
      allowed &&
      advancedOpen &&
      new URLSearchParams(window.location.search).get("section") ===
        "job-titles"
    ) {
      document
        .getElementById("setup-job-titles")
        ?.scrollIntoView({ block: "start" });
    }
  }, [allowed]);
  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold text-white">التهيئة</h1>
          <p className="mt-2 text-gray-300">
            ثلاثة أجزاء لإعداد العمل. ارجع مباشرة إلى أي جزء عند الحاجة.
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !allowed ? (
          <Card>
            <CardContent className="pt-6">
              التهيئة متاحة لمسؤول النظام والشؤون الإدارية.
            </CardContent>
          </Card>
        ) : (
          <>
            <nav
              aria-label="أجزاء التهيئة"
              className="grid gap-3 md:grid-cols-3"
            >
              {SETUP_SECTIONS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={section === item.id ? "step" : undefined}
                  onClick={() => setSection(item.id)}
                  className={[
                    "flex min-w-0 items-center gap-3 rounded-xl border p-4 text-start transition-colors",
                    section === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-card-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </button>
              ))}
            </nav>
            {section === "structure" && (canStructure ? <OrgSetup /> : <p>لا تملك صلاحية عرض الهيكل التشغيلي.</p>)}
            {section === "supervisors" && (canAccounts ? <UsersTab /> : <p>لا تملك صلاحية عرض الحسابات.</p>)}
            {section === "workers" && (
              <Card>
                <CardHeader>
                  <CardTitle>إضافة العمال وربطهم</CardTitle>
                  <CardDescription>
                    استورد أسماء العمال أو أضفهم، ثم أكمل مركز التكلفة والقسم
                    والمشرفين من قائمة العمال وبطاقة كل عامل.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    ساعات العمل اليومية ويوم الراحة وارتباطات المشرفين محفوظة في
                    بطاقة العامل لتعديلها من مكان واحد.
                  </p>
                  <Button asChild>
                    <Link href="/workers?setup=1">
                      فتح إعداد العمال
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {section !== "structure" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setSection(
                      section === "workers" ? "supervisors" : "structure",
                    )
                  }
                >
                  السابق
                </Button>
              ) : (
                <span />
              )}
              {section !== "workers" && (
                <Button
                  onClick={() =>
                    setSection(
                      section === "structure" ? "supervisors" : "workers",
                    )
                  }
                >
                  التالي: {section === "structure" ? "المشرفون" : "العمال"}
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
            <details
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              className="rounded-xl border bg-card text-card-foreground"
            >
              <summary className="flex cursor-pointer items-center gap-2 p-4 font-semibold">
                <Settings2 className="h-4 w-4" />
                إدارة متقدمة
              </summary>
              <div className="space-y-5 border-t p-4">
                <p className="text-sm text-muted-foreground">
                  إدارة القوائم القائمة وحالتها. لإضافة موقع أو قسم إلى موضع
                  محدد، استخدم الهيكل التشغيلي أعلاه.
                </p>
                <div className="grid gap-4 lg:grid-cols-3">
                  <SimpleCatalogCard
                    title="مراكز التكلفة"
                    description="إدارة المراكز الحالية"
                    listQuery={trpc.orgStructure.listBranches}
                    createMutation={trpc.orgStructure.createBranch}
                    updateMutation={trpc.orgStructure.updateBranch}
                    deleteMutation={trpc.orgStructure.deleteBranch}
                    idField="branchId"
                    invalidateKey="listBranches"
                  />
                  <SimpleCatalogCard
                    title="المواقع"
                    description="يشمل المواقع التي لم تربط بمركز بعد"
                    listQuery={trpc.orgStructure.listLocations}
                    createMutation={trpc.orgStructure.createLocation}
                    updateMutation={trpc.orgStructure.updateLocation}
                    deleteMutation={trpc.orgStructure.deleteLocation}
                    idField="locationId"
                    invalidateKey="listLocations"
                  />
                  <SimpleCatalogCard
                    title="الأقسام"
                    description="يشمل الأقسام التي لم تربط بموقع بعد"
                    listQuery={trpc.orgStructure.listDepartments}
                    createMutation={trpc.orgStructure.createDepartment}
                    updateMutation={trpc.orgStructure.updateDepartment}
                    deleteMutation={trpc.orgStructure.deleteDepartment}
                    idField="departmentId"
                    invalidateKey="listDepartments"
                  />
                </div>
                <div id="setup-job-titles">
                  <JobTitlesCard />
                </div>
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium">
                    بقية حسابات المستخدمين
                  </summary>
                  <div className="pt-4">
                    <UsersTab allAccounts />
                  </div>
                </details>
              </div>
            </details>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
