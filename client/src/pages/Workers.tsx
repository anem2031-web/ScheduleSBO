import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { WorkerBatchTools } from "@/components/workers/WorkerBatchTools";
import { WorkerArchiveAction } from "@/components/workers/WorkerArchiveAction";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  Fingerprint,
  Loader2,
  Plus,
  Search,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { ProductBrand } from "@/components/ProductBrand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { formatDateTime, normalizeDigits } from "@shared/display-format";
import { WORKER_LANGUAGES } from "@shared/worker-languages";
import { workerPhoneNumberSchema } from "@shared/worker-phone";
import { permits } from "@shared/access-control";
import { useLanguage } from "@/lib/i18n";
import { localizedName, localizedJobTitle } from "@/lib/localized-data";

type WorkerStatus = "active" | "inactive" | "on_leave" | "terminated";

type WorkerForm = {
  employeeId: string;
  fingerprintId: string;
  nameAr: string;
  nameEn: string;
  nameUr: string;
  sourceLanguage: "" | "ar" | "en" | "ur";
  phoneNumber: string;
  nationality: string;
  preferredLanguage: string;
  locationId: string;
  departmentId: string;
  jobTitleId: string;
  primarySupervisorId: string;
  hireDate: string;
  status: WorkerStatus;
};

const createEmptyForm = (): WorkerForm => ({
  employeeId: "",
  fingerprintId: "",
  nameAr: "",
  nameEn: "",
  nameUr: "",
  sourceLanguage: "ar",
  phoneNumber: "",
  nationality: "",
  preferredLanguage: "ar",
  locationId: "",
  departmentId: "",
  jobTitleId: "",
  primarySupervisorId: "",
  hireDate: "",
  status: "active",
});

const statusLabels: Record<WorkerStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  on_leave: "في إجازة",
  terminated: "منتهي الخدمة",
};
const statusTranslated: Record<WorkerStatus, { en: string; ur: string }> = {
  active: { en: "Active", ur: "فعال" },
  inactive: { en: "Inactive", ur: "غیر فعال" },
  on_leave: { en: "On leave", ur: "چھٹی پر" },
  terminated: { en: "Employment ended", ur: "ملازمت ختم" },
};

const fieldClassName =
  "h-11 border-[#263348] bg-[#162234] text-[#F5F7FA] placeholder:text-[#98A4B5] focus-visible:border-[#D2AD61]/70 focus-visible:ring-[#D2AD61]/10";

const selectTriggerClassName =
  "h-11 w-full border-[#263348] bg-[#162234] text-[#F5F7FA] focus:border-[#D2AD61]/70 focus:ring-[#D2AD61]/10";

const selectContentClassName = "border-[#263348] bg-[#162234] text-[#F5F7FA]";

function getStatusClass(status: WorkerStatus) {
  switch (status) {
    case "active":
      return "status-success";

    case "on_leave":
      return "status-warning";

    case "terminated":
      return "status-danger";

    case "inactive":
    default:
      return "status-neutral";
  }
}

function formatDate(value: Date | string | null | undefined, language: "ar" | "en" | "ur") {
  if (!value) return { ar: "غير محدد", en: "Not set", ur: "مقرر نہیں" }[language];
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return formatDateTime(
    date,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
    "ar-SA",
  );
}

export default function Workers() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const statusLabel = (status: WorkerStatus) => language === "ar" ? statusLabels[status] : statusTranslated[status]?.[language] ?? status;
  const canManage = user?.role === "admin" || permits(user?.permissions ?? [], "workers:update");
  const canCreate = user?.role === "admin" || permits(user?.permissions ?? [], "workers:create");
  const canDelete = user?.role === "admin" || permits(user?.permissions ?? [], "workers:delete");
  const isSetup =
    new URLSearchParams(window.location.search).get("setup") === "1";
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<WorkerForm>(createEmptyForm);

  const [pendingEditId, setPendingEditId] = useState<number | null>(() => {
    const query = new URLSearchParams(window.location.search);

    const value = Number(query.get("edit"));

    return Number.isInteger(value) && value > 0 ? value : null;
  });

  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const translationRefreshTimers = useRef<number[]>([]);
  const [translationWorkerId, setTranslationWorkerId] = useState<number | undefined>();
  const [translationPolling, setTranslationPolling] = useState(false);
  const translationStatus = trpc.workers.nameTranslationStatus.useQuery(
    { workerId: translationWorkerId },
    { enabled: !!form.sourceLanguage || !!translationWorkerId, refetchInterval: translationPolling ? 2000 : false, retry: false },
  );

  useEffect(() => () => {
    translationRefreshTimers.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    // A translation may have finished in the background since this data was cached.
    void utils.workers.list.invalidate();
    void utils.workers.referenceData.invalidate();
  }, [language]);

  const refreshPendingNameTranslation = (id: number) => {
    // The provider is asynchronous; make recently completed names visible without
    // claiming that a request was completed or that translation is configured.
    translationRefreshTimers.current.forEach(timer => window.clearTimeout(timer));
    translationRefreshTimers.current = [];
    setTranslationWorkerId(id);
    setTranslationPolling(true);
    void utils.workers.nameTranslationStatus.invalidate({ workerId: id });
    for (const delay of [3000, 8000, 17000, 25000, 30000]) {
      const timer = window.setTimeout(() => {
        translationRefreshTimers.current = translationRefreshTimers.current.filter(id => id !== timer);
        void utils.workers.list.invalidate();
        void utils.workers.referenceData.invalidate();
        void utils.workers.getById.invalidate();
        if (delay === 30000) setTranslationPolling(false);
      }, delay);
      translationRefreshTimers.current.push(timer);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      if (searchTerm.trim() !== debouncedSearch) {
        setPage(1);
        setSelectedIds([]);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  const workersQuery = trpc.workers.list.useQuery({
    search: debouncedSearch || undefined,
    isActive: includeArchived ? undefined : true,
    page,
    pageSize: 50,
  });

  const referenceQuery = trpc.workers.referenceData.useQuery();

  const departmentId = Number(form.departmentId || 0);

  const jobsQuery = trpc.workers.jobTitlesByDepartment.useQuery(
    {
      departmentId,
    },
    {
      enabled: departmentId > 0,
    },
  );

  const supervisorUsersQuery = trpc.users.listByRole.useQuery(
    { role: "supervisor" },
    { enabled: canManage },
  );

  const pendingWorkerQuery = trpc.workers.getById.useQuery(
    { id: pendingEditId ?? 0 },
    { enabled: !!pendingEditId && canManage },
  );

  const activeAssignmentsQuery =
    trpc.supervisorAssignments.listAssignments.useQuery({ activeOnly: true });

  const createAssignmentMutation =
    trpc.supervisorAssignments.createAssignment.useMutation({
      onError: (error) => {
        toast.error(`${text("تم حفظ العامل، لكن تعذّر إسناد المشرف", "The worker was saved, but the supervisor could not be assigned", "کارکن محفوظ ہو گیا، لیکن سپروائزر مقرر نہیں ہو سکا")}: ${error.message}`);
      },
    });

  const createMutation = trpc.workers.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workers.list.invalidate(),
        utils.workers.referenceData.invalidate(),
      ]);
    },

    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.workers.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workers.list.invalidate(),
        utils.workers.referenceData.invalidate(),
      ]);
    },

    onError: (error) => {
      toast.error(error.message);
    },
  });

  const workers = workersQuery.data?.items ?? [];

  const departments = referenceQuery.data?.departments ?? [];

  const supervisors = (supervisorUsersQuery.data ?? []).filter(
    (supervisor) => supervisor.isActive,
  );

  const activeAssignments = activeAssignmentsQuery.data ?? [];

  const jobs = jobsQuery.data ?? [];

  useEffect(() => {
    if (!form.jobTitleId && jobs.length === 1)
      setForm((current) => ({ ...current, jobTitleId: String(jobs[0].id) }));
  }, [jobsQuery.data, form.jobTitleId]);

  const departmentNames = useMemo(
    () =>
      new Map(
        departments.map((department) => [department.id, localizedName(department, language)]),
      ),
    [departments, language],
  );

  const workerStatistics = useMemo(
    () => ({
      active: workers.filter((worker) => worker.status === "active").length,

      onLeave: workers.filter((worker) => worker.status === "on_leave").length,

      terminated: workers.filter((worker) => worker.status === "terminated")
        .length,
    }),
    [workers],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setDialogOpen(true);
  };

  const openEdit = (worker: (typeof workers)[number]) => {
    setEditingId(worker.id);

    const currentAssignment = activeAssignments.find(
      (a: any) => a.workerId === worker.id && a.assignmentType === "primary",
    );

    setForm({
      employeeId: worker.employeeId,
      fingerprintId: worker.fingerprintId ?? "",
      nameAr: worker.nameAr,
      nameEn: worker.nameEn ?? "",
      nameUr: worker.nameUr ?? "",
      sourceLanguage: "",
      phoneNumber: worker.phoneNumber ?? "",
      nationality: worker.nationality ?? "",
      preferredLanguage: worker.preferredLanguage ?? "ar",
      locationId: worker.locationId ? String(worker.locationId) : "",
      departmentId: String(worker.departmentId),
      jobTitleId: String(worker.jobTitleId),
      primarySupervisorId: currentAssignment
        ? String(currentAssignment.supervisorId)
        : "",
      hireDate: worker.hireDate ? new Date(worker.hireDate).toISOString().slice(0, 10) : "",
      status: worker.status,
    });

    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);

    if (!open) {
      setEditingId(null);
      setForm(createEmptyForm());
    }
  };

  useEffect(() => {
    if (!pendingEditId || workersQuery.isLoading || dialogOpen) {
      return;
    }

    const worker =
      workers.find((item) => item.id === pendingEditId) ??
      pendingWorkerQuery.data;

    if (!worker) {
      return;
    }

    openEdit(worker);
    setPendingEditId(null);

    window.history.replaceState({}, "", "/workers");
  }, [
    pendingEditId,
    workersQuery.isLoading,
    workers,
    pendingWorkerQuery.data,
    dialogOpen,
  ]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.departmentId || !form.jobTitleId) {
      toast.error(text("القسم والمسمى الوظيفي مطلوبان", "Department and job title are required", "شعبہ اور عہدہ درکار ہیں"));

      return;
    }

    const phoneNumber = workerPhoneNumberSchema.safeParse(form.phoneNumber);
    if (!phoneNumber.success) {
      toast.error(phoneNumber.error.issues[0].message);
      return;
    }

    const selectedSupervisorId = Number(form.primarySupervisorId);

    // primarySupervisorId لم يعد يُرسل مباشرة لجدول العمال — الربط الآن
    // عبر جدول إسناد المشرفين (supervisor_assignments)، لأن المشرف هنا
    // حساب مستخدم (users) وليس عاملًا آخر.
    const payload = {
      fingerprintId: form.fingerprintId.trim() || undefined,

      nameAr: form.nameAr.trim(),

      nameEn: form.nameEn.trim() || undefined,

      nameUr: form.nameUr.trim() || undefined,

      sourceLanguage: form.sourceLanguage || undefined,

      phoneNumber: phoneNumber.data ?? null,

      nationality: form.nationality.trim() || undefined,
      preferredLanguage: form.preferredLanguage as "ar" | "en" | "ur" | "hi" | "bn" | "ne" | "fil",
      locationId: form.locationId ? Number(form.locationId) : null,

      departmentId: Number(form.departmentId),

      jobTitleId: Number(form.jobTitleId),

      hireDate: form.hireDate || null,
      status: form.status,
    };

    let workerId = editingId;

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...payload,
        });
      } else {
        const created = await createMutation.mutateAsync({
          employeeId: form.employeeId.trim().toUpperCase(),
          ...payload,
        });

        workerId = created.id;
        setEditingId(workerId);
      }

      if (!workerId) return;
      if (payload.sourceLanguage) refreshPendingNameTranslation(workerId);

      if (
        selectedSupervisorId > 0 &&
        !activeAssignments.some(
          (a) =>
            a.workerId === workerId && a.supervisorId === selectedSupervisorId,
        )
      ) {
        await createAssignmentMutation.mutateAsync({
          workerId,
          supervisorId: selectedSupervisorId,
          assignmentType: "secondary",
        });

        utils.supervisorAssignments.listAssignments.invalidate();
      }
      toast.success(text("تم حفظ بيانات العامل وارتباطاته", "Worker details and assignments saved", "کارکن کی تفصیلات اور ذمہ داریاں محفوظ ہو گئیں"));
      setDialogOpen(false);
      setEditingId(null);
      setForm(createEmptyForm());
    } catch {
      /* Mutations show the specific error; a created worker keeps its ID for a safe retry. */
    }
  };

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    createAssignmentMutation.isPending;

  const isInitialLoading = workersQuery.isLoading && !workersQuery.data;

  return (
    <DashboardLayout>
      <div className="executive-page space-y-6">
        {translationWorkerId && <div role="status" className="rounded-lg border bg-card p-3 text-sm">
          {translationStatus.isError
            ? (language === "en" ? "Name translation status is unavailable. Check permissions or the server." : language === "ur" ? "نام کے ترجمے کی حیثیت دستیاب نہیں۔ اجازت یا سرور چیک کریں۔" : "تعذر معرفة حالة ترجمة الاسم؛ تحقق من الصلاحيات أو الخادم.")
            : translationStatus.data?.attempt === "pending"
              ? (language === "en" ? "Translating the worker name…" : language === "ur" ? "ملازم کے نام کا ترجمہ جاری ہے…" : "جارٍ ترجمة اسم العامل…")
              : translationStatus.data?.attempt === "complete"
                ? (language === "en" ? "Name translation attempt completed. Review the names." : language === "ur" ? "نام کے ترجمے کی کوشش مکمل ہوئی؛ نام چیک کریں۔" : "اكتملت محاولة ترجمة الاسم؛ راجع الأسماء.")
                : translationStatus.data?.attempt === "failed"
                  ? (language === "en" ? "Name translation failed. The original was saved. Check server logs and provider settings, then edit the worker, select the source language and save to retry." : language === "ur" ? "نام کا ترجمہ ناکام رہا، اصل نام محفوظ ہے۔ سرور اور فراہم کنندہ کی ترتیبات چیک کریں، پھر ملازم میں ترمیم کر کے اصل زبان منتخب کریں اور دوبارہ محفوظ کریں۔" : "فشلت ترجمة الاسم، وحُفظ الاسم الأصلي. راجع سجلات الخادم وإعدادات الخدمة، ثم عدّل العامل واختر لغة الاسم الأصلية واحفظ لإعادة المحاولة.")
                  : translationStatus.data?.attempt === "not_configured"
                    ? (language === "en" ? "Name translation is not configured on this server. The original was saved." : language === "ur" ? "اس سرور پر نام کا ترجمہ فعال نہیں۔ اصل نام محفوظ ہے۔" : "ترجمة الأسماء غير مهيأة في هذا الخادم؛ حُفظ الاسم الأصلي.")
                    : (language === "en" ? "Translation attempt status is not available on this server. Review the saved names." : language === "ur" ? "اس سرور پر ترجمے کی حیثیت دستیاب نہیں؛ محفوظ نام چیک کریں۔" : "حالة محاولة الترجمة غير متاحة على هذا الخادم؛ راجع الأسماء المحفوظة.")}
        </div>}
        <section className="executive-page-header">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D2AD61]/40 bg-[#D2AD61]/10 text-[#E6C982] shadow-[0_0_18px_rgba(210,173,97,0.06)]">
              <Users className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <ProductBrand compact />

              <h1 className="executive-page-title">{text("إدارة العمال", "Worker management", "کارکنوں کا انتظام")}</h1>

              <p className="executive-page-description">
                {text("إدارة البيانات الوظيفية وملفات العمال وحالاتهم التشغيلية.", "Manage employment details, worker profiles and their status.", "ملازمت کی تفصیلات، کارکنوں کے پروفائل اور ان کی حالت کا انتظام کریں۔")}
              </p>
            </div>
          </div>

          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="executive-button-primary gap-2 px-5"
            >
              <Plus className="h-4 w-4" />
              {text("إضافة عامل جديد", "Add worker", "کارکن شامل کریں")}
            </Button>
          )}
        </section>

        {isSetup && canManage && (
          <Card>
            <CardHeader>
              <CardTitle>{text("إعداد العمال", "Worker setup", "کارکنوں کی ترتیب")}</CardTitle>
              <CardDescription>
                {text("ارفع الأسماء أو أضف عاملًا، ثم حدد المجموعة لتعيين القسم والمشرفين والساعات ويوم الراحة. يمكن تعديل الاستثناءات من بطاقة العامل.", "Upload names or add a worker, then select workers to assign departments, supervisors, hours and rest days. Exceptions can be changed in the worker profile.", "نام اپ لوڈ کریں یا کارکن شامل کریں، پھر شعبہ، سپروائزر، اوقات اور آرام کا دن مقرر کریں۔ استثنائی تبدیلیاں کارکن کے پروفائل میں کی جا سکتی ہیں۔")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/settings")}>
                {text("العودة إلى التهيئة", "Back to setup", "ترتیبات پر واپس جائیں")}
              </Button>
            </CardContent>
          </Card>
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <WorkerBatchTools
              selected={workers.filter((worker) =>
                selectedIds.includes(worker.id),
              )}
              onComplete={() => {
                workersQuery.refetch();
              }}
            />
            {selectedIds.length > 0 && (
              <Button variant="ghost" onClick={() => setSelectedIds([])}>
                {text("إلغاء التحديد", "Clear selection", "انتخاب ختم کریں")}
              </Button>
            )}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="executive-kpi executive-card--highlight">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="executive-kpi-label">{debouncedSearch ? text("نتائج البحث", "Search results", "تلاش کے نتائج") : text("إجمالي العمال", "Total workers", "کل کارکنان")}</p>

                <p className="executive-kpi-value text-[#E6C982]">
                  {workersQuery.data?.total ?? 0}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  {debouncedSearch ? text("إجمالي العمال المطابقين للبحث", "Total workers matching the search", "تلاش سے مماثل کل کارکن") : text("إجمالي السجلات في النظام", "Total records in the system", "سسٹم میں کل ریکارڈ")}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D2AD61]/30 bg-[#D2AD61]/10 text-[#E6C982]">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="executive-kpi">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="executive-kpi-label">{text("العمال النشطون", "Active workers", "فعال کارکن")}</p>

                <p className="executive-kpi-value">{workerStatistics.active}</p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  {text("ضمن النتائج المعروضة", "In displayed results", "دکھائے گئے نتائج میں")}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2CCB8C]/30 bg-[#2CCB8C]/10 text-[#2CCB8C]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="executive-kpi">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="executive-kpi-label">{text("في إجازة", "On leave", "چھٹی پر")}</p>

                <p className="executive-kpi-value text-[#F2B84B]">
                  {workerStatistics.onLeave}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  {text("ضمن النتائج المعروضة", "In displayed results", "دکھائے گئے نتائج میں")}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#F2B84B]/30 bg-[#F2B84B]/10 text-[#F2B84B]">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="executive-kpi">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="executive-kpi-label">{text("منتهية خدمتهم", "Employment ended", "ملازمت ختم")}</p>

                <p className="executive-kpi-value text-[#EF5B67]">
                  {workerStatistics.terminated}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  {text("ضمن النتائج المعروضة", "In displayed results", "دکھائے گئے نتائج میں")}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#EF5B67]/30 bg-[#EF5B67]/10 text-[#EF5B67]">
                <UserX className="h-5 w-5" />
              </div>
            </div>
          </div>
        </section>

        <Card className="executive-card border-[#263348] bg-transparent">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A4B5]" />

                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={text("ابحث بالاسم أو الرقم الوظيفي أو رقم البصمة", "Search by name, employee or fingerprint ID", "نام، ملازم نمبر یا فنگر پرنٹ نمبر سے تلاش کریں")}
                  className={`${fieldClassName} pr-10`}
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-[#98A4B5]">
                <Fingerprint className="h-4 w-4 text-[#26B9D1]" />

                <span>{text("البحث يتم تلقائيًا أثناء الكتابة", "Search updates as you type", "لکھتے ہی تلاش تازہ ہوتی ہے")}</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={includeArchived}
                  onCheckedChange={(checked) => {
                    setIncludeArchived(checked === true);
                    setSelectedIds([]);
                    setPage(1);
                  }}
                />
                {text("إظهار المؤرشفين وغير النشطين", "Show archived and inactive workers", "محفوظ شدہ اور غیر فعال کارکن دکھائیں")}
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="executive-card overflow-hidden border-[#263348] bg-transparent">
          <CardHeader className="border-b border-[#263348] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="executive-section-title">
                  {text("قائمة العمال", "Workers", "کارکنوں کی فہرست")}
                </CardTitle>

                <CardDescription className="executive-section-description">
                  {text("عرض البيانات الأساسية والحالة الحالية لكل عامل.", "Basic details and current status for each worker.", "ہر کارکن کی بنیادی تفصیلات اور موجودہ حالت۔")}
                </CardDescription>
              </div>

              <Badge variant="outline" className="status-info w-fit">
                {workers.length} {text("عامل معروض", "workers shown", "کارکن دکھائے گئے")}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isInitialLoading ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[#98A4B5]">
                <Loader2 className="h-7 w-7 animate-spin text-[#26B9D1]" />

                <p className="text-sm">{text("جارٍ تحميل بيانات العمال...", "Loading workers...", "کارکنوں کی تفصیلات لوڈ ہو رہی ہیں...")}</p>
              </div>
            ) : workersQuery.isError ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
                <UserX className="h-8 w-8 text-[#EF5B67]" />

                <p className="font-semibold text-[#F5F7FA]">
                  {text("تعذر تحميل بيانات العمال", "Could not load workers", "کارکنوں کی تفصیلات لوڈ نہیں ہو سکیں")}
                </p>

                <p className="max-w-md text-sm text-[#98A4B5]">
                  {workersQuery.error.message}
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => workersQuery.refetch()}
                  className="executive-button-secondary"
                >
                  {text("إعادة المحاولة", "Try again", "دوبارہ کوشش کریں")}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {canManage && (
                        <TableHead className="w-12">
                          <Checkbox
                            aria-label={text("تحديد كل العمال المعروضين", "Select all displayed workers", "دکھائے گئے تمام کارکن منتخب کریں")}
                            checked={
                              !!workers.length &&
                              workers.every((worker) =>
                                selectedIds.includes(worker.id),
                              )
                            }
                            onCheckedChange={(checked) =>
                              setSelectedIds(
                                checked
                                  ? workers.map((worker) => worker.id)
                                  : [],
                              )
                            }
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-start">
                        {text("الرقم الوظيفي", "Employee ID", "ملازم نمبر")}
                      </TableHead>

                      <TableHead className="text-start">{text("اسم العامل", "Worker name", "کارکن کا نام")}</TableHead>

                      <TableHead className="text-start">{text("رقم البصمة", "Fingerprint ID", "فنگر پرنٹ نمبر")}</TableHead>

                      <TableHead className="text-start">{text("القسم", "Department", "شعبہ")}</TableHead>

                      <TableHead className="text-start">
                        {text("تاريخ التعيين", "Hire date", "ملازمت کی تاریخ")}
                      </TableHead>

                      <TableHead className="text-start">{text("الحالة", "Status", "حالت")}</TableHead>

                      <TableHead className="text-start">{text("الإجراءات", "Actions", "کارروائیاں")}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {workers.map((worker) => (
                      <TableRow key={worker.id}>
                        {canManage && (
                          <TableCell>
                            <Checkbox
                              aria-label={text(`تحديد ${normalizeDigits(localizedName(worker, language))}`, `Select ${normalizeDigits(localizedName(worker, language))}`, `${normalizeDigits(localizedName(worker, language))} منتخب کریں`)}
                              checked={selectedIds.includes(worker.id)}
                              onCheckedChange={(checked) =>
                                setSelectedIds((current) =>
                                  checked
                                    ? [...current, worker.id]
                                    : current.filter((id) => id !== worker.id),
                                )
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="font-numeric font-semibold text-[#26B9D1]">
                            {normalizeDigits(worker.employeeId)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-[170px]">
                            <p className="font-semibold text-[#F5F7FA]">
                              {normalizeDigits(localizedName(worker, language))}
                            </p>

                            {language === "ar" && worker.nameEn && (
                              <p
                                dir="ltr"
                                className="font-numeric mt-0.5 text-right text-[11px] uppercase text-[#98A4B5]"
                              >
                                {normalizeDigits(worker.nameEn)}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          {worker.fingerprintId ? (
                            <span className="font-numeric text-[#C8D1DE]">
                              {normalizeDigits(worker.fingerprintId)}
                            </span>
                          ) : (
                            <span className="text-[#6F7B8D]">{text("غير مسجل", "Not set", "درج نہیں")}</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="text-[#C8D1DE]">
                            {normalizeDigits(
                              departmentNames.get(worker.departmentId) ??
                                text(`قسم رقم ${worker.departmentId}`, `Department ${worker.departmentId}`, `شعبہ ${worker.departmentId}`),
                            )}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-numeric whitespace-nowrap text-[#C8D1DE]">
                            {formatDate(worker.hireDate, language)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStatusClass(worker.status)}
                          >
                            {statusLabel(worker.status)}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div className="flex min-w-max flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/workers/${worker.id}`)}
                              className="h-9 gap-1.5 rounded-lg px-3 text-[#26B9D1] hover:bg-[#26B9D1]/10 hover:text-[#52CEE1]"
                            >
                              <Eye className="h-4 w-4" />
                              {text("البطاقة", "Profile", "پروفائل")}
                            </Button>

                            {canManage && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(worker)}
                                className="h-9 gap-1.5 rounded-lg px-3 text-[#E6C982] hover:bg-[#D2AD61]/10 hover:text-[#E6C982]"
                              >
                                <Edit className="h-4 w-4" />
                                {text("تعديل", "Edit", "ترمیم")}
                              </Button>
                            )}

                            {canDelete && (
                              <WorkerArchiveAction
                                worker={worker}
                                onCompleted={() => {
                                  setSelectedIds((current) =>
                                    current.filter((id) => id !== worker.id),
                                  );
                                  setPage(1);
                                }}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {!workers.length && (
                      <TableRow>
                        <TableCell
                          colSpan={canManage ? 8 : 7}
                          className="h-64 text-center"
                        >
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#263348] bg-[#162234] text-[#98A4B5]">
                              <Users className="h-6 w-6" />
                            </div>

                            <div>
                              <p className="font-semibold text-[#F5F7FA]">
                                {text("لا توجد بيانات", "No data", "کوئی ڈیٹا نہیں")}
                              </p>

                              <p className="mt-1 text-sm text-[#98A4B5]">
                                {debouncedSearch
                                  ? text("لا توجد نتائج مطابقة لعبارة البحث.", "No results match your search.", "تلاش سے کوئی نتیجہ نہیں ملا۔")
                                  : text("لم تتم إضافة أي عامل حتى الآن.", "No workers have been added yet.", "ابھی تک کوئی کارکن شامل نہیں کیا گیا۔")}
                              </p>
                            </div>

                            {!debouncedSearch && canManage && (
                              <Button
                                type="button"
                                onClick={openCreate}
                                className="executive-button-primary mt-2 gap-2"
                              >
                                <Plus className="h-4 w-4" />
                                {text("إضافة أول عامل", "Add the first worker", "پہلا کارکن شامل کریں")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {(workersQuery.data?.totalPages ?? 0) > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {text(`صفحة ${page} من ${workersQuery.data?.totalPages}`, `Page ${page} of ${workersQuery.data?.totalPages}`, `صفحہ ${page} از ${workersQuery.data?.totalPages}`)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => {
                  setPage((value) => value - 1);
                  setSelectedIds([]);
                }}
              >
                {text("السابق", "Previous", "پچھلا")}
              </Button>
              <Button
                variant="outline"
                disabled={page >= (workersQuery.data?.totalPages ?? 1)}
                onClick={() => {
                  setPage((value) => value + 1);
                  setSelectedIds([]);
                }}
              >
                {text("التالي", "Next", "اگلا")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          dir={language === "en" ? "ltr" : "rtl"}
          className="max-h-[90vh] overflow-y-auto border-[#263348] bg-[#111B2A] text-[#F5F7FA] sm:max-w-2xl"
        >
          <DialogHeader className="border-b border-[#263348] pb-4 text-start">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D2AD61]/35 bg-[#D2AD61]/10 text-[#E6C982]">
                {editingId ? (
                  <Edit className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </div>

              <div>
                <DialogTitle className="text-xl font-bold text-[#F5F7FA]">
                  {editingId ? text("تعديل بيانات العامل", "Edit worker", "کارکن میں ترمیم") : text("إضافة عامل جديد", "Add worker", "کارکن شامل کریں")}
                </DialogTitle>

                <DialogDescription className="mt-1 text-sm leading-6 text-[#98A4B5]">
                  {text("أدخل البيانات الأساسية والوظيفية للعامل، ثم احفظ السجل.", "Enter the worker’s basic and employment details, then save.", "کارکن کی بنیادی اور ملازمت کی تفصیلات درج کریں، پھر محفوظ کریں۔")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={submit} className="grid gap-5 pt-2 md:grid-cols-2">
            <Field label={text("الرقم الوظيفي", "Employee ID", "ملازم نمبر")} required>
              <Input
                required
                disabled={Boolean(editingId)}
                value={form.employeeId}
                placeholder={text("مثال: W-12008", "Example: W-12008", "مثال: W-12008")}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: event.target.value.toUpperCase(),
                  }))
                }
                className={`${fieldClassName} font-numeric disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </Field>

            <Field label={text("رقم البصمة", "Fingerprint ID", "فنگر پرنٹ نمبر")}>
              <Input
                value={form.fingerprintId}
                placeholder={text("اختياري", "Optional", "اختیاری")}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fingerprintId: event.target.value,
                  }))
                }
                className={`${fieldClassName} font-numeric`}
              />
            </Field>

            <Field label={text("الاسم بالعربية", "Name in Arabic", "عربی میں نام")} required>
              <Input
                required
                value={form.nameAr}
                placeholder={text("الاسم الكامل", "Full name", "پورا نام")}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nameAr: event.target.value,
                  }))
                }
                className={fieldClassName}
              />
            </Field>

            <Field label={text("الاسم بالإنجليزية", "Name in English", "انگریزی میں نام")}>
              <Input
                dir="ltr"
                value={form.nameEn}
                placeholder="Full name"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nameEn: event.target.value,
                  }))
                }
                className={`${fieldClassName} font-numeric text-left`}
              />
            </Field>

            <Field label={language === "en" ? "Name in Urdu" : language === "ur" ? "اردو میں نام" : "الاسم بالأردية"}>
              <Input
                dir="rtl"
                value={form.nameUr}
                onChange={(event) => setForm((current) => ({ ...current, nameUr: event.target.value }))}
                className={fieldClassName}
              />
            </Field>

            <Field label={language === "en" ? "Source language for translation (optional)" : language === "ur" ? "ترجمے کی اصل زبان (اختیاری)" : "لغة الاسم الأصلية للترجمة (اختياري)"}>
              <Select value={form.sourceLanguage || "none"} onValueChange={(value) => setForm(current => ({...current, sourceLanguage:value === "none" ? "" : value as "ar" | "en" | "ur"}))}>
                <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  <SelectItem value="none">{language === "en" ? "Do not translate automatically" : language === "ur" ? "خودکار ترجمہ نہ کریں" : "عدم الترجمة التلقائية"}</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem><SelectItem value="ur">اردو</SelectItem>
                </SelectContent>
              </Select>
              {form.sourceLanguage && translationStatus.data?.configuration !== "ready" && <p className="mt-1 text-xs text-amber-700" role="status">
                {translationStatus.isError
                  ? (language === "en" ? "Cannot check translation configuration." : language === "ur" ? "ترجمے کی ترتیبات چیک نہیں ہو سکیں۔" : "تعذر فحص إعداد الترجمة.")
                  : translationStatus.data
                    ? (language === "en" ? "Automatic translation is not configured on this server; the original name will be saved." : language === "ur" ? "اس سرور پر خودکار ترجمہ فعال نہیں؛ اصل نام محفوظ ہو گا۔" : "الترجمة التلقائية غير مهيأة في هذا الخادم؛ سيُحفظ الاسم الأصلي.")
                    : (language === "en" ? "Checking translation configuration…" : language === "ur" ? "ترجمے کی ترتیبات چیک کی جا رہی ہیں…" : "جارٍ فحص إعداد الترجمة…")}
              </p>}
            </Field>

            <Field label={text("رقم هاتف العامل", "Worker phone number", "کارکن کا فون نمبر")}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-label={text("رقم هاتف العامل", "Worker phone number", "کارکن کا فون نمبر")}
                dir="ltr"
                maxLength={32}
                value={form.phoneNumber}
                placeholder="05xxxxxxxx / +9665xxxxxxxx"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phoneNumber: normalizeDigits(event.target.value),
                  }))
                }
                className={`${fieldClassName} font-numeric text-left`}
              />
              <p className="text-xs text-[#98A4B5]">
                {text("اختياري؛ أدخل الرقم المحلي أو مع رمز الدولة.", "Optional; enter a local number or include the country code.", "اختیاری؛ مقامی نمبر درج کریں یا ملک کا کوڈ شامل کریں۔")}
              </p>
            </Field>

            <Field label={text("الجنسية", "Nationality", "قومیت")}>
              <Input
                value={form.nationality}
                placeholder={text("اختياري", "Optional", "اختیاری")}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nationality: event.target.value,
                  }))
                }
                className={fieldClassName}
              />
            </Field>

            <Field label={text("لغة التواصل", "Communication language", "رابطے کی زبان")}>
              <Select value={form.preferredLanguage} onValueChange={value => setForm(current => ({...current, preferredLanguage:value}))}>
                <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                <SelectContent className={selectContentClassName}>{WORKER_LANGUAGES.map(option => {
                  const names: Record<string, { en: string; ur: string }> = {
                    ar: { en: "Arabic", ur: "عربی" }, en: { en: "English", ur: "انگریزی" }, ur: { en: "Urdu", ur: "اردو" },
                    hi: { en: "Hindi", ur: "ہندی" }, bn: { en: "Bengali", ur: "بنگالی" }, ne: { en: "Nepali", ur: "نیپالی" }, fil: { en: "Filipino", ur: "فلپائنی" },
                  };
                  return <SelectItem key={option.code} value={option.code}>{language === "ar" ? option.label : names[option.code]?.[language] ?? option.label}</SelectItem>;
                })}</SelectContent>
              </Select>
              {!["ar", "en"].includes(form.preferredLanguage) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="status">
                {text("لا يتوفر حاليًا قالب جدول واتساب بهذه اللغة؛ يحتاج العامل إلى قالب معتمد قبل إرسال جدوله بلغته.", "A WhatsApp schedule template is not yet available in this language; an approved template is needed before sending the schedule in this language.", "اس زبان میں واٹس ایپ شیڈول کا ٹیمپلیٹ فی الحال دستیاب نہیں؛ اس زبان میں شیڈول بھیجنے کے لیے منظور شدہ ٹیمپلیٹ درکار ہے۔")}
              </p>}
            </Field>
            <Field label={text("موقع العمل", "Work location", "کام کی جگہ")}>
              <Select value={form.locationId || "none"} onValueChange={value => setForm(current => ({...current, locationId:value === "none" ? "" : value}))}>
                <SelectTrigger className={selectTriggerClassName}><SelectValue placeholder={text("اختر الموقع", "Select location", "مقام منتخب کریں")} /></SelectTrigger>
                <SelectContent className={selectContentClassName}><SelectItem value="none">{text("غير محدد", "Not set", "مقرر نہیں")}</SelectItem>{(referenceQuery.data?.locations ?? []).map(location => <SelectItem key={location.id} value={String(location.id)}>{normalizeDigits(localizedName(location, language))}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={text("تاريخ التعيين (اختياري)", "Hire date (optional)", "ملازمت کی تاریخ (اختیاری)")}>
              <Input
                type="date"
                value={form.hireDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hireDate: event.target.value,
                  }))
                }
                className={`${fieldClassName} font-numeric`}
              />
            </Field>

            <Field label={text("القسم", "Department", "شعبہ")} required>
              <Select
                value={form.departmentId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    departmentId: value,
                    jobTitleId: "",
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue placeholder={text("اختر القسم", "Select department", "شعبہ منتخب کریں")} />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir={language === "en" ? "ltr" : "rtl"}>
                  {departments.map((department) => (
                    <SelectItem
                      key={department.id}
                      value={String(department.id)}
                    >
                      {localizedName(department, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departmentId > 0 &&
                !jobsQuery.isLoading &&
                jobs.length === 0 && (
                  <p className="text-xs text-destructive">
                    {text("لا توجد مسميات لهذا القسم.", "There are no job titles for this department.", "اس شعبے کے لیے کوئی عہدہ نہیں۔")}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => navigate("/settings?section=job-titles")}
                    >
                      {text("إضافة مسمى من التهيئة", "Add a job title in setup", "ترتیبات میں عہدہ شامل کریں")}
                    </button>
                  </p>
                )}
            </Field>

            <Field label={text("المسمى الوظيفي", "Job title", "عہدہ")} required>
              <Select
                value={form.jobTitleId}
                disabled={!form.departmentId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    jobTitleId: value,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue
                    placeholder={
                      form.departmentId
                        ? text("اختر المسمى الوظيفي", "Select job title", "عہدہ منتخب کریں")
                        : text("اختر القسم أولًا", "Select a department first", "پہلے شعبہ منتخب کریں")
                    }
                  />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir={language === "en" ? "ltr" : "rtl"}>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {localizedJobTitle(job, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={
                editingId
                  ? text("إضافة مشرف إلى العامل", "Add supervisor to worker", "کارکن کے لیے سپروائزر شامل کریں")
                  : text("المشرف (يمكن استكماله من البطاقة)", "Supervisor (can be added later in the profile)", "سپروائزر (بعد میں پروفائل سے شامل کر سکتے ہیں)")
              }
            >
              <Select
                value={form.primarySupervisorId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    primarySupervisorId: value,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue placeholder={text("اختر مشرفًا من الحسابات المعدّة", "Select a supervisor from existing accounts", "موجودہ اکاؤنٹس سے سپروائزر منتخب کریں")} />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir={language === "en" ? "ltr" : "rtl"}>
                  {supervisors.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-500">
                      {text("لا توجد حسابات مشرفين — أنشئها من التهيئة ← المشرفون", "No supervisor accounts — create one in Setup → Supervisors", "سپروائزر کا کوئی اکاؤنٹ نہیں — ترتیبات میں بنائیں")}
                    </div>
                  ) : (
                    supervisors.map((supervisor: any) => (
                      <SelectItem
                        key={supervisor.id}
                        value={String(supervisor.id)}
                      >
                        {supervisor.name}{supervisor.email ? ` (${supervisor.email})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>

            <Field label={text("الحالة", "Status", "حالت")} required>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as WorkerStatus,
                  }))
                }
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir={language === "en" ? "ltr" : "rtl"}>
                  {Object.keys(statusLabels).map((value) => (
                    <SelectItem key={value} value={value}>
                      {statusLabel(value as WorkerStatus)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <DialogFooter className="mt-2 gap-2 border-t border-[#263348] pt-5 md:col-span-2 sm:justify-start">
              <Button
                type="submit"
                disabled={busy}
                className="executive-button-primary min-w-32 gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}

                {editingId ? text("حفظ التعديلات", "Save changes", "تبدیلیاں محفوظ کریں") : text("إضافة العامل", "Add worker", "کارکن شامل کریں")}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => handleDialogOpenChange(false)}
                className="executive-button-secondary min-w-24"
              >
                {text("إلغاء", "Cancel", "منسوخ کریں")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[#C8D1DE]">
        {label}

        {required && (
          <span className="mr-1 text-[#EF5B67]" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {children}
    </div>
  );
}
