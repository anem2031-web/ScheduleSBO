import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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

type WorkerStatus = "active" | "inactive" | "on_leave" | "terminated";

type WorkerForm = {
  employeeId: string;
  fingerprintId: string;
  nameAr: string;
  nameEn: string;
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

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "غير محدد";
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
        toast.error(`تم حفظ العامل، لكن تعذّر إسناد المشرف: ${error.message}`);
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
        departments.map((department) => [department.id, department.nameAr]),
      ),
    [departments],
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
      toast.error("القسم والمسمى الوظيفي مطلوبان");

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
      toast.success("تم حفظ بيانات العامل وارتباطاته");
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
        <section className="executive-page-header">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D2AD61]/40 bg-[#D2AD61]/10 text-[#E6C982] shadow-[0_0_18px_rgba(210,173,97,0.06)]">
              <Users className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <ProductBrand compact />

              <h1 className="executive-page-title">إدارة العمال</h1>

              <p className="executive-page-description">
                إدارة البيانات الوظيفية وملفات العمال وحالاتهم التشغيلية.
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
              إضافة عامل جديد
            </Button>
          )}
        </section>

        {isSetup && canManage && (
          <Card>
            <CardHeader>
              <CardTitle>إعداد العمال</CardTitle>
              <CardDescription>
                ارفع الأسماء أو أضف عاملًا، ثم حدد المجموعة لتعيين القسم
                والمشرفين والساعات ويوم الراحة. يمكن تعديل الاستثناءات من بطاقة
                العامل.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/settings")}>
                العودة إلى التهيئة
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
                إلغاء التحديد
              </Button>
            )}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="executive-kpi executive-card--highlight">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="executive-kpi-label">{debouncedSearch ? "نتائج البحث" : "إجمالي العمال"}</p>

                <p className="executive-kpi-value text-[#E6C982]">
                  {workersQuery.data?.total ?? 0}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  {debouncedSearch ? "إجمالي العمال المطابقين للبحث" : "إجمالي السجلات في النظام"}
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
                <p className="executive-kpi-label">العمال النشطون</p>

                <p className="executive-kpi-value">{workerStatistics.active}</p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  ضمن النتائج المعروضة
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
                <p className="executive-kpi-label">في إجازة</p>

                <p className="executive-kpi-value text-[#F2B84B]">
                  {workerStatistics.onLeave}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  ضمن النتائج المعروضة
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
                <p className="executive-kpi-label">منتهية خدمتهم</p>

                <p className="executive-kpi-value text-[#EF5B67]">
                  {workerStatistics.terminated}
                </p>

                <p className="mt-2 text-xs text-[#98A4B5]">
                  ضمن النتائج المعروضة
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
                  placeholder="ابحث بالاسم أو الرقم الوظيفي أو رقم البصمة"
                  className={`${fieldClassName} pr-10`}
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-[#98A4B5]">
                <Fingerprint className="h-4 w-4 text-[#26B9D1]" />

                <span>البحث يتم تلقائيًا أثناء الكتابة</span>
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
                إظهار المؤرشفين وغير النشطين
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="executive-card overflow-hidden border-[#263348] bg-transparent">
          <CardHeader className="border-b border-[#263348] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="executive-section-title">
                  قائمة العمال
                </CardTitle>

                <CardDescription className="executive-section-description">
                  عرض البيانات الأساسية والحالة الحالية لكل عامل.
                </CardDescription>
              </div>

              <Badge variant="outline" className="status-info w-fit">
                {workers.length} عامل معروض
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isInitialLoading ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[#98A4B5]">
                <Loader2 className="h-7 w-7 animate-spin text-[#26B9D1]" />

                <p className="text-sm">جارٍ تحميل بيانات العمال...</p>
              </div>
            ) : workersQuery.isError ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
                <UserX className="h-8 w-8 text-[#EF5B67]" />

                <p className="font-semibold text-[#F5F7FA]">
                  تعذر تحميل بيانات العمال
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
                  إعادة المحاولة
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
                            aria-label="تحديد كل العمال المعروضين"
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
                      <TableHead className="text-right">
                        الرقم الوظيفي
                      </TableHead>

                      <TableHead className="text-right">اسم العامل</TableHead>

                      <TableHead className="text-right">رقم البصمة</TableHead>

                      <TableHead className="text-right">القسم</TableHead>

                      <TableHead className="text-right">
                        تاريخ التعيين
                      </TableHead>

                      <TableHead className="text-right">الحالة</TableHead>

                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {workers.map((worker) => (
                      <TableRow key={worker.id}>
                        {canManage && (
                          <TableCell>
                            <Checkbox
                              aria-label={`تحديد ${normalizeDigits(worker.nameAr)}`}
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
                              {normalizeDigits(worker.nameAr)}
                            </p>

                            {worker.nameEn && (
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
                            <span className="text-[#6F7B8D]">غير مسجل</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="text-[#C8D1DE]">
                            {normalizeDigits(
                              departmentNames.get(worker.departmentId) ??
                                `قسم رقم ${worker.departmentId}`,
                            )}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-numeric whitespace-nowrap text-[#C8D1DE]">
                            {formatDate(worker.hireDate)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStatusClass(worker.status)}
                          >
                            {statusLabels[worker.status]}
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
                              البطاقة
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
                                تعديل
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
                                لا توجد بيانات
                              </p>

                              <p className="mt-1 text-sm text-[#98A4B5]">
                                {debouncedSearch
                                  ? "لا توجد نتائج مطابقة لعبارة البحث."
                                  : "لم تتم إضافة أي عامل حتى الآن."}
                              </p>
                            </div>

                            {!debouncedSearch && canManage && (
                              <Button
                                type="button"
                                onClick={openCreate}
                                className="executive-button-primary mt-2 gap-2"
                              >
                                <Plus className="h-4 w-4" />
                                إضافة أول عامل
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
              صفحة {page} من {workersQuery.data?.totalPages}
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
                السابق
              </Button>
              <Button
                variant="outline"
                disabled={page >= (workersQuery.data?.totalPages ?? 1)}
                onClick={() => {
                  setPage((value) => value + 1);
                  setSelectedIds([]);
                }}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] overflow-y-auto border-[#263348] bg-[#111B2A] text-[#F5F7FA] sm:max-w-2xl"
        >
          <DialogHeader className="border-b border-[#263348] pb-4 text-right">
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
                  {editingId ? "تعديل بيانات العامل" : "إضافة عامل جديد"}
                </DialogTitle>

                <DialogDescription className="mt-1 text-sm leading-6 text-[#98A4B5]">
                  أدخل البيانات الأساسية والوظيفية للعامل، ثم احفظ السجل.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={submit} className="grid gap-5 pt-2 md:grid-cols-2">
            <Field label="الرقم الوظيفي" required>
              <Input
                required
                disabled={Boolean(editingId)}
                value={form.employeeId}
                placeholder="مثال: W-12008"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: event.target.value.toUpperCase(),
                  }))
                }
                className={`${fieldClassName} font-numeric disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </Field>

            <Field label="رقم البصمة">
              <Input
                value={form.fingerprintId}
                placeholder="اختياري"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fingerprintId: event.target.value,
                  }))
                }
                className={`${fieldClassName} font-numeric`}
              />
            </Field>

            <Field label="الاسم بالعربية" required>
              <Input
                required
                value={form.nameAr}
                placeholder="الاسم الكامل"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nameAr: event.target.value,
                  }))
                }
                className={fieldClassName}
              />
            </Field>

            <Field label="الاسم بالإنجليزية">
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

            <Field label="رقم هاتف العامل">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-label="رقم هاتف العامل"
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
                اختياري؛ أدخل الرقم المحلي أو مع رمز الدولة.
              </p>
            </Field>

            <Field label="الجنسية">
              <Input
                value={form.nationality}
                placeholder="اختياري"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nationality: event.target.value,
                  }))
                }
                className={fieldClassName}
              />
            </Field>

            <Field label="لغة التواصل">
              <Select value={form.preferredLanguage} onValueChange={value => setForm(current => ({...current, preferredLanguage:value}))}>
                <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                <SelectContent className={selectContentClassName}>{WORKER_LANGUAGES.map(language => <SelectItem key={language.code} value={language.code}>{language.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="موقع العمل">
              <Select value={form.locationId || "none"} onValueChange={value => setForm(current => ({...current, locationId:value === "none" ? "" : value}))}>
                <SelectTrigger className={selectTriggerClassName}><SelectValue placeholder="اختر الموقع" /></SelectTrigger>
                <SelectContent className={selectContentClassName}><SelectItem value="none">غير محدد</SelectItem>{(referenceQuery.data?.locations ?? []).map(location => <SelectItem key={location.id} value={String(location.id)}>{normalizeDigits(location.nameAr)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="تاريخ التعيين (اختياري)">
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

            <Field label="القسم" required>
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
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir="rtl">
                  {departments.map((department) => (
                    <SelectItem
                      key={department.id}
                      value={String(department.id)}
                    >
                      {department.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departmentId > 0 &&
                !jobsQuery.isLoading &&
                jobs.length === 0 && (
                  <p className="text-xs text-destructive">
                    لا توجد مسميات لهذا القسم.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => navigate("/settings?section=job-titles")}
                    >
                      إضافة مسمى من التهيئة
                    </button>
                  </p>
                )}
            </Field>

            <Field label="المسمى الوظيفي" required>
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
                        ? "اختر المسمى الوظيفي"
                        : "اختر القسم أولًا"
                    }
                  />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir="rtl">
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {job.titleAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={
                editingId
                  ? "إضافة مشرف إلى العامل"
                  : "المشرف (يمكن استكماله من البطاقة)"
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
                  <SelectValue placeholder="اختر مشرفًا من الحسابات المعدّة" />
                </SelectTrigger>

                <SelectContent className={selectContentClassName} dir="rtl">
                  {supervisors.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-500">
                      لا توجد حسابات مشرفين — أنشئها من التهيئة ← المشرفون
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

            <Field label="الحالة" required>
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

                <SelectContent className={selectContentClassName} dir="rtl">
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
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

                {editingId ? "حفظ التعديلات" : "إضافة العامل"}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => handleDialogOpenChange(false)}
                className="executive-button-secondary min-w-24"
              >
                إلغاء
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
