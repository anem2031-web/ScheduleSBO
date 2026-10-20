import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { productBrand } from "@shared/brand";
import { trpc } from "@/lib/trpc";
import { parseWorkerImport, type WorkerImportRow } from "@/lib/worker-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, normalizeDigits } from "@shared/display-format";
import { useAuth } from "@/_core/hooks/useAuth";
import { permits } from "@shared/access-control";

type ImportProgress = {
  workerId?: number;
  linkedIds: number[];
  savedDuty?: boolean;
  done?: boolean;
  error?: string;
};
type WorkerChoice = {
  id: number;
  nameAr: string;
  departmentId: number;
  jobTitleId: number;
};
const weekdays = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
const localDate = () =>
  formatDateTime(
    new Date(),
    {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
    "en-CA",
  );

export function WorkerBatchTools({
  selected,
  onComplete,
}: {
  selected: WorkerChoice[];
  onComplete: () => void;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const canImport = permits(user?.permissions ?? [], "workers:create");
  const canUpdate = permits(user?.permissions ?? [], "workers:update");
  const [mode, setMode] = useState<"import" | "bulk" | null>(null);
  const [rows, setRows] = useState<WorkerImportRow[]>([]);
  const [progress, setProgress] = useState<Record<number, ImportProgress>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [supervisorIds, setSupervisorIds] = useState<number[]>([]);
  const [hours, setHours] = useState("");
  const [restDay, setRestDay] = useState("");
  const [branch, setBranch] = useState("");
  const [hireDate, setHireDate] = useState(localDate);
  const utils = trpc.useUtils();
  const reference = trpc.workers.referenceData.useQuery(undefined, {
    enabled: !!mode,
  });
  const jobs = trpc.workers.jobTitlesByDepartment.useQuery(
    { departmentId: Number(departmentId) },
    { enabled: !!mode && !!departmentId },
  );
  const supervisors = trpc.users.listByRole.useQuery(
    { role: "supervisor" },
    { enabled: !!mode },
  );
  const branches = trpc.orgStructure.listBranches.useQuery(
    { activeOnly: true },
    { enabled: !!mode },
  );
  const links = trpc.supervisorAssignments.listAssignments.useQuery(
    { activeOnly: true },
    { enabled: !!mode },
  );
  const create = trpc.workers.create.useMutation();
  const update = trpc.workers.update.useMutation();
  const addSupervisor =
    trpc.supervisorAssignments.createAssignment.useMutation();
  const saveDuty = trpc.workers.updateDutySettings.useMutation();
  useEffect(() => {
    if (!jobTitleId && jobs.data?.length === 1)
      setJobTitleId(String(jobs.data[0].id));
  }, [jobs.data, jobTitleId]);

  const open = (value: "import" | "bulk") => {
    setMode(value);
    setRows([]);
    setProgress({});
    setError("");
    setDepartmentId("");
    setJobTitleId("");
    setSupervisorIds([]);
    setHours("");
    setRestDay("");
    setBranch("");
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("حجم الملف يتجاوز 2 ميجابايت.");
      if (!/\.(csv|tsv)$/i.test(file.name))
        throw new Error(
          "اختر ملف CSV أو TSV. يمكن حفظه من Excel بهذا التنسيق.",
        );
      setRows(parseWorkerImport(await file.text()));
      setProgress({});
      setError("");
    } catch (error) {
      setRows([]);
      setError((error as Error).message);
    }
  };
  const editRow = (
    index: number,
    field: "employeeId" | "nameAr" | "fingerprintId" | "phoneNumber",
    value: string,
  ) => {
    const edited = rows.map((row, current) =>
      current === index ? { ...row, [field]: value } : row,
    );
    const csv =
      "employeeId,nameAr,fingerprintId,phoneNumber\n" +
      edited
        .map((row) =>
          [row.employeeId, row.nameAr, row.fingerprintId ?? "", row.phoneNumber ?? ""]
            .map((value) => `"${value.replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n");
    try {
      setRows(parseWorkerImport(csv));
      setProgress((current) => ({
        ...current,
        [index]: {
          ...current[index],
          linkedIds: current[index]?.linkedIds ?? [],
          error: undefined,
        },
      }));
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFFالرقم الوظيفي,الاسم بالعربية,رقم البصمة,رقم الهاتف\r\n"], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${productBrand(language).name}-قالب-العمال.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const commonInvalid = () => {
    if ((mode === "import" || departmentId) && (!departmentId || !jobTitleId))
      return "اختر القسم والمسمى الوظيفي للمجموعة.";
    if (mode === "import" && (!hours || !restDay))
      return "حدد الساعات اليومية ويوم الراحة للمجموعة؛ تستطيع تعديل الاستثناءات من بطاقة العامل.";
    if (
      hours &&
      (!Number.isFinite(Number(hours)) ||
        Number(hours) < 0.5 ||
        Number(hours) > 24)
    )
      return "أدخل ساعات يومية بين نصف ساعة و24 ساعة.";
    if (mode === "import" && (!rows.length || rows.some((row) => row.error)))
      return "حمّل الأسماء وصحح أخطاء المعاينة أولًا.";
    if (mode === "bulk" && !selected.length)
      return "حدد عاملًا واحدًا على الأقل.";
    if (
      mode === "bulk" &&
      !departmentId &&
      !supervisorIds.length &&
      !hours &&
      !restDay &&
      !branch
    )
      return "حدد التعديل الذي تريد تطبيقه على المجموعة.";
    if (links.isError || links.isLoading)
      return "انتظر تحميل ارتباطات المشرفين أو أعد المحاولة.";
    return "";
  };
  const execute = async () => {
    const invalid = commonInvalid();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    let success = 0,
      failed = 0;
    const count = mode === "import" ? rows.length : selected.length;
    // Each row retains its created ID and completed stages, so a partial failure can be retried without re-creating the worker.
    for (let index = 0; index < count; index++) {
      let state: ImportProgress = {
        ...progress[index],
        linkedIds: [...(progress[index]?.linkedIds ?? [])],
      };
      if (state.done) {
        success++;
        continue;
      }
      try {
        if (mode === "import" && !state.workerId) {
          const row = rows[index];
          const worker = await create.mutateAsync({
            employeeId: row.employeeId,
            nameAr: row.nameAr,
            fingerprintId: row.fingerprintId,
            phoneNumber: row.phoneNumber,
            departmentId: Number(departmentId),
            jobTitleId: Number(jobTitleId),
            hireDate,
            status: "active",
          });
          state.workerId = worker.id;
        } else if (mode === "bulk") {
          state.workerId = selected[index].id;
          if (departmentId)
            await update.mutateAsync({
              id: state.workerId,
              departmentId: Number(departmentId),
              jobTitleId: Number(jobTitleId),
            });
        }
        if (!state.workerId) throw new Error("تعذر تحديد العامل المحفوظ.");
        for (const supervisorId of supervisorIds) {
          if (
            state.linkedIds.includes(supervisorId) ||
            links.data?.some(
              (link) =>
                link.workerId === state.workerId &&
                link.supervisorId === supervisorId,
            )
          )
            continue;
          await addSupervisor.mutateAsync({
            workerId: state.workerId,
            supervisorId,
            assignmentType: "secondary",
          });
          state.linkedIds.push(supervisorId);
        }
        if ((hours || restDay || branch) && !state.savedDuty) {
          const current =
            mode === "bulk"
              ? await utils.schedules.getWorkerCard.fetch({
                  workerId: state.workerId,
                })
              : null;
          if (
            (!hours && !current) ||
            (!restDay && current?.weeklyRestDay == null)
          )
            throw new Error(
              "أكمل الساعات ويوم الراحة لهذا العامل أو حددهما للمجموعة.",
            );
          await saveDuty.mutateAsync({
            workerId: state.workerId,
            requiredDailyHours: hours
              ? Number(hours)
              : Number(current!.requiredHoursPerDay),
            weeklyRestDay: restDay ? Number(restDay) : current!.weeklyRestDay,
            branch: branch
              ? branch === "none"
                ? null
                : branch
              : (current?.branch ?? null),
          });
          state.savedDuty = true;
        }
        state.done = true;
        state.error = undefined;
        success++;
      } catch (error) {
        state.error = (error as Error).message;
        failed++;
      }
      setProgress((current) => ({ ...current, [index]: state }));
    }
    await Promise.all([
      utils.workers.list.invalidate(),
      utils.supervisorAssignments.listAssignments.invalidate(),
      utils.schedules.getWorkerCard.invalidate(),
      utils.schedules.getWorkerTimeline.invalidate(),
    ]);
    setBusy(false);
    if (failed)
      setError(
        `اكتمل ${success} عاملًا وتعذر استكمال ${failed}. راجع سبب كل سطر ثم أعد محاولة السطور غير المكتملة.`,
      );
    else toast.success(`تم حفظ ${success} عاملًا بنجاح`);
    onComplete();
  };
  const started = Object.values(progress).some((item) => item.workerId);
  return (
    <>
      {canImport && <Button
        variant="outline"
        className="gap-2"
        onClick={() => open("import")}
      >
        <Upload className="h-4 w-4" />
        استيراد الأسماء
      </Button>}
      {canUpdate && <Button
        variant="outline"
        className="gap-2"
        disabled={!selected.length}
        onClick={() => open("bulk")}
      >
        <Users className="h-4 w-4" />
        تعديل المجموعة {selected.length ? `(${selected.length})` : ""}
      </Button>}
      <Dialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open && !busy) setMode(null);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "import"
                ? "استيراد العمال وربطهم"
                : `تعديل ${selected.length} عاملًا دفعة واحدة`}
            </DialogTitle>
            <DialogDescription>
              {mode === "import"
                ? "ارفع الأسماء، راجعها، ثم حدد البيانات المشتركة. تستطيع تخصيص الاستثناءات من بطاقة كل عامل بعد الحفظ."
                : "تُطبق القيم التي تحددها فقط، وتبقى بقية البيانات وارتباطات المشرفين محفوظة."}
            </DialogDescription>
          </DialogHeader>
          {mode === "import" && (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                aria-label="ملف أسماء العمال"
                accept=".csv,.tsv"
                disabled={busy || started}
                className="min-w-56 flex-1"
                onChange={(event) => readFile(event.target.files?.[0])}
              />
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="ml-2 h-4 w-4" />
                تحميل القالب
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                CSV / TSV بترميز UTF-8، حتى 500 عامل. الأعمدة: الرقم الوظيفي،
                الاسم بالعربية، رقم البصمة ورقم الهاتف (اختياريان).
                احفظ أرقام الهاتف كنص في Excel للحفاظ على الصفر في البداية.
              </p>
            </div>
          )}
          <fieldset
            disabled={busy || started}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-2">
              <Label>القسم {mode === "bulk" && "(اختياري)"}</Label>
              <Select
                value={departmentId}
                onValueChange={(value) => {
                  setDepartmentId(value);
                  setJobTitleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      mode === "bulk" ? "إبقاء القسم الحالي" : "اختر القسم"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {reference.data?.departments.map((department) => (
                    <SelectItem
                      key={department.id}
                      value={String(department.id)}
                    >
                      {normalizeDigits(department.nameAr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المسمى الوظيفي</Label>
              <Select
                value={jobTitleId}
                disabled={!departmentId}
                onValueChange={setJobTitleId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      departmentId ? "اختر المسمى" : "اختر القسم أولًا"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {jobs.data?.map((job) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {normalizeDigits(job.titleAr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!!departmentId &&
                !jobs.isLoading &&
                !jobs.data?.length &&
                !jobs.isError && (
                  <p className="text-xs text-destructive">
                    لا توجد مسميات لهذا القسم.{" "}
                    <a
                      className="underline"
                      href="/settings?section=job-titles"
                    >
                      إضافة مسمى من التهيئة
                    </a>
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <Label>مركز التكلفة</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      mode === "bulk" ? "إبقاء المركز الحالي" : "اختياري"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير محدد</SelectItem>
                  {branches.data?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.code}>
                      {normalizeDigits(branch.nameAr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الساعات اليومية</Label>
              <Input
                type="number"
                min="0.5"
                max="24"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                placeholder={
                  mode === "bulk" ? "إبقاء الساعات الحالية" : "أدخل ساعات العمل"
                }
              />
            </div>
            <div className="space-y-2">
              <Label>يوم الراحة</Label>
              <Select value={restDay} onValueChange={setRestDay}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      mode === "bulk" ? "إبقاء اليوم الحالي" : "اختر اليوم"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {[6, 0, 1, 2, 3, 4, 5].map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {weekdays[day]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "import" && (
              <div className="space-y-2">
                <Label>تاريخ التعيين للمجموعة</Label>
                <Input
                  type="date"
                  value={hireDate}
                  onChange={(event) => setHireDate(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>المشرفون الذين تريد إضافتهم</Label>
              <div className="flex flex-wrap gap-4">
                {supervisors.data
                  ?.filter((supervisor) => supervisor.isActive)
                  .map((supervisor) => (
                    <label
                      key={supervisor.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={supervisorIds.includes(supervisor.id)}
                        onCheckedChange={(checked) =>
                          setSupervisorIds((current) =>
                            checked
                              ? [...current, supervisor.id]
                              : current.filter((id) => id !== supervisor.id),
                          )
                        }
                      />
                      {normalizeDigits(supervisor.name ?? "")}
                    </label>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                الإضافة تحافظ على المشرفين الحاليين. لإنهاء ربط مشرف بعامل معين،
                افتح بطاقة العامل.
              </p>
            </div>
          </fieldset>
          {[
            reference.error,
            jobs.error,
            supervisors.error,
            branches.error,
            links.error,
          ]
            .filter(Boolean)
            .map((error, index) => (
              <p className="text-sm text-destructive" key={index}>
                {normalizeDigits(error?.message ?? "")}
              </p>
            ))}
          {mode === "import" && !!rows.length && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
              <p className="text-sm font-semibold">
                معاينة {rows.length} عاملًا — يمكن تصحيح الأسماء والأرقام قبل
                الحفظ
              </p>
              {rows.map((row, index) => (
                <div key={index} className="space-y-1 rounded-lg border p-2">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      aria-label={`الرقم الوظيفي للسطر ${index + 1}`}
                      dir="ltr"
                      value={row.employeeId}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "employeeId", event.target.value)
                      }
                    />
                    <Input
                      aria-label={`اسم العامل في السطر ${index + 1}`}
                      value={row.nameAr}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "nameAr", event.target.value)
                      }
                    />
                    <Input
                      aria-label={`رقم البصمة للسطر ${index + 1}`}
                      value={row.fingerprintId ?? ""}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "fingerprintId", event.target.value)
                      }
                    />
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      aria-label={`رقم هاتف العامل للسطر ${index + 1}`}
                      dir="ltr"
                      maxLength={32}
                      placeholder="رقم الهاتف (اختياري)"
                      value={row.phoneNumber ?? ""}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "phoneNumber", normalizeDigits(event.target.value))
                      }
                    />
                  </div>
                  {(row.error || progress[index]?.error) && (
                    <p className="text-xs text-destructive">
                      {normalizeDigits(
                        row.error || progress[index]?.error || "",
                      )}
                    </p>
                  )}
                  {progress[index]?.done && (
                    <p className="text-xs text-emerald-600">
                      تم الحفظ — يمكن فتح بطاقة العامل من القائمة.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {mode === "bulk" && (
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {selected.map((worker, index) => (
                <p key={worker.id} className="text-sm">
                  {normalizeDigits(worker.nameAr)}
                  {progress[index]?.done ? " — تم الحفظ" : ""}
                  {progress[index]?.error && (
                    <span className="mr-2 text-destructive">
                      {normalizeDigits(progress[index].error ?? "")}
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {normalizeDigits(error)}
            </p>
          )}
          {started && (
            <p className="text-xs text-muted-foreground">
              حُفظت نتائج السطور أعلاه. إعادة المحاولة تُكمل السطور المتعثرة فقط
              بنفس البيانات.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                (mode === "import" && !rows.length) ||
                (started &&
                  Object.values(progress).every((item) => item.done) &&
                  Object.keys(progress).length ===
                    (mode === "import" ? rows.length : selected.length))
              }
              onClick={execute}
            >
              {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {busy
                ? "جارٍ حفظ المجموعة..."
                : started
                  ? "استكمال السطور غير المكتملة"
                  : mode === "import"
                    ? "استيراد وحفظ المجموعة"
                    : "تطبيق التعديلات"}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setMode(null)}
            >
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
