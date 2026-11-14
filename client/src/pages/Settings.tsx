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
import { useLanguage } from "@/lib/i18n";

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
const settingsText = {
  ar: {title:"التهيئة", intro:"ثلاثة أجزاء لإعداد العمل. ارجع مباشرة إلى أي جزء عند الحاجة.", access:"التهيئة متاحة لمسؤول النظام والشؤون الإدارية.", navigation:"أجزاء التهيئة", structure:"الهيكل التشغيلي", structureDesc:"مراكز التكلفة والمواقع والأقسام", supervisors:"المشرفون", supervisorsDesc:"حسابات المشرفين وصلاحياتهم", workers:"العمال", workersDesc:"رفع الأسماء وإكمال الارتباطات", noStructure:"لا تملك صلاحية عرض الهيكل التشغيلي.", noAccounts:"لا تملك صلاحية عرض الحسابات.", workersTitle:"إضافة العمال وربطهم", workersHelp:"استورد أسماء العمال أو أضفهم، ثم أكمل مركز التكلفة والقسم والمشرفين من قائمة العمال وبطاقة كل عامل.", workersDetail:"ساعات العمل اليومية ويوم الراحة وارتباطات المشرفين محفوظة في بطاقة العامل لتعديلها من مكان واحد.", openWorkers:"فتح إعداد العمال", previous:"السابق", next:"التالي:", advanced:"إدارة متقدمة", advancedHelp:"إدارة القوائم القائمة وحالتها. لإضافة موقع أو قسم إلى موضع محدد، استخدم الهيكل التشغيلي أعلاه.", centers:"مراكز التكلفة", centersDesc:"إدارة المراكز الحالية", locations:"المواقع", locationsDesc:"يشمل المواقع التي لم تربط بمركز بعد", departments:"الأقسام", departmentsDesc:"يشمل الأقسام التي لم تربط بموقع بعد", otherAccounts:"بقية حسابات المستخدمين"},
  en: {title:"Setup", intro:"Three sections to set up your operation. Return to any section when needed.", access:"Setup is available to system administrators and administrative affairs.", navigation:"Setup sections", structure:"Organization structure", structureDesc:"Cost centers, locations and departments", supervisors:"Supervisors", supervisorsDesc:"Supervisor accounts and permissions", workers:"Workers", workersDesc:"Import names and complete assignments", noStructure:"You do not have permission to view the organization structure.", noAccounts:"You do not have permission to view accounts.", workersTitle:"Add and assign workers", workersHelp:"Import or add workers, then complete their cost center, department and supervisor assignments from the workers list and each worker's profile.", workersDetail:"Daily working hours, the weekly day off and supervisor assignments are kept in the worker's profile for editing in one place.", openWorkers:"Open worker setup", previous:"Previous", next:"Next:", advanced:"Advanced management", advancedHelp:"Manage existing lists and their status. To add a location or department in a specific place, use the organization structure above.", centers:"Cost centers", centersDesc:"Manage existing centers", locations:"Locations", locationsDesc:"Includes locations not yet linked to a center", departments:"Departments", departmentsDesc:"Includes departments not yet linked to a location", otherAccounts:"Other user accounts"},
  ur: {title:"ابتدائی ترتیب", intro:"کام کی ترتیب کے تین حصے ہیں۔ ضرورت پر کسی بھی حصے میں واپس آئیں۔", access:"ترتیب نظام کے منتظم اور انتظامی امور کے لیے دستیاب ہے۔", navigation:"ترتیب کے حصے", structure:"تنظیمی ڈھانچہ", structureDesc:"لاگت کے مراکز، مقامات اور محکمے", supervisors:"نگران", supervisorsDesc:"نگرانوں کے اکاؤنٹس اور اختیارات", workers:"کارکن", workersDesc:"نام درآمد کریں اور وابستگیاں مکمل کریں", noStructure:"آپ کو تنظیمی ڈھانچہ دیکھنے کی اجازت نہیں ہے۔", noAccounts:"آپ کو اکاؤنٹس دیکھنے کی اجازت نہیں ہے۔", workersTitle:"کارکن شامل اور منسلک کریں", workersHelp:"کارکنوں کے نام درآمد یا شامل کریں، پھر کارکنوں کی فہرست اور ہر کارکن کے پروفائل سے لاگت مرکز، محکمہ اور نگران مقرر کریں۔", workersDetail:"روزانہ کام کے اوقات، ہفتہ وار چھٹی اور نگران کی وابستگیاں کارکن کے پروفائل میں محفوظ ہیں۔", openWorkers:"کارکنوں کی ترتیب کھولیں", previous:"پچھلا", next:"اگلا:", advanced:"جدید انتظام", advancedHelp:"موجودہ فہرستوں اور ان کی حالت کا انتظام کریں۔ کسی مخصوص جگہ مقام یا محکمہ شامل کرنے کے لیے اوپر دیا گیا تنظیمی ڈھانچہ استعمال کریں۔", centers:"لاگت کے مراکز", centersDesc:"موجودہ مراکز کا انتظام", locations:"مقامات", locationsDesc:"وہ مقامات بھی شامل ہیں جو ابھی کسی مرکز سے منسلک نہیں", departments:"محکمے", departmentsDesc:"وہ محکمے بھی شامل ہیں جو ابھی کسی مقام سے منسلک نہیں", otherAccounts:"دیگر صارف اکاؤنٹس"},
} as const;

export default function Settings() {
  const { language } = useLanguage();
  const text = settingsText[language];
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
      <div className="space-y-6" dir={language === "en" ? "ltr" : "rtl"}>
        <div>
          <h1 className="text-3xl font-bold text-white">{text.title}</h1>
          <p className="mt-2 text-gray-300">
            {text.intro}
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !allowed ? (
          <Card>
            <CardContent className="pt-6">
              {text.access}
            </CardContent>
          </Card>
        ) : (
          <>
            <nav
              aria-label={text.navigation}
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
                      {item.id === "structure" ? text.structure : item.id === "supervisors" ? text.supervisors : text.workers}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.id === "structure" ? text.structureDesc : item.id === "supervisors" ? text.supervisorsDesc : text.workersDesc}
                    </span>
                  </div>
                </button>
              ))}
            </nav>
            {section === "structure" && (canStructure ? <OrgSetup /> : <p>{text.noStructure}</p>)}
            {section === "supervisors" && (canAccounts ? <UsersTab /> : <p>{text.noAccounts}</p>)}
            {section === "workers" && (
              <Card>
                <CardHeader>
                  <CardTitle>{text.workersTitle}</CardTitle>
                  <CardDescription>
                    {text.workersHelp}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {text.workersDetail}
                  </p>
                  <Button asChild>
                    <Link href="/workers?setup=1">
                      {text.openWorkers}
                      <ArrowLeft className={`h-4 w-4 ${language === "en" ? "rotate-180" : ""}`} />
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
                  {text.previous}
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
                  {text.next} {section === "structure" ? text.supervisors : text.workers}
                  <ArrowLeft className={`h-4 w-4 ${language === "en" ? "rotate-180" : ""}`} />
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
                {text.advanced}
              </summary>
              <div className="space-y-5 border-t p-4">
                <p className="text-sm text-muted-foreground">
                  {text.advancedHelp}
                </p>
                <div className="grid gap-4 lg:grid-cols-3">
                  <SimpleCatalogCard
                    title={text.centers}
                    description={text.centersDesc}
                    listQuery={trpc.orgStructure.listBranches}
                    createMutation={trpc.orgStructure.createBranch}
                    updateMutation={trpc.orgStructure.updateBranch}
                    deleteMutation={trpc.orgStructure.deleteBranch}
                    idField="branchId"
                    invalidateKey="listBranches"
                  />
                  <SimpleCatalogCard
                    title={text.locations}
                    description={text.locationsDesc}
                    listQuery={trpc.orgStructure.listLocations}
                    createMutation={trpc.orgStructure.createLocation}
                    updateMutation={trpc.orgStructure.updateLocation}
                    deleteMutation={trpc.orgStructure.deleteLocation}
                    idField="locationId"
                    invalidateKey="listLocations"
                  />
                  <SimpleCatalogCard
                    title={text.departments}
                    description={text.departmentsDesc}
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
                    {text.otherAccounts}
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
