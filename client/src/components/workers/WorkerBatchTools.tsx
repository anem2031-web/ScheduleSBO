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
import { localizedName, localizedJobTitle } from "@/lib/localized-data";

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
  nameEn?: string | null;
  nameUr?: string | null;
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
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const dayLabel = (day: number) => language === "ar" ? weekdays[day] : language === "en" ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] : ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"][day];
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
  const [hireDate, setHireDate] = useState("");
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
        throw new Error(text("حجم الملف يتجاوز 2 ميجابايت.", "File size exceeds 2 MB.", "فائل کا سائز 2 MB سے زیادہ ہے۔"));
      if (!/\.(csv|tsv)$/i.test(file.name))
        throw new Error(
          text("اختر ملف CSV أو TSV. يمكن حفظه من Excel بهذا التنسيق.", "Choose a CSV or TSV file. Excel can save files in this format.", "CSV یا TSV فائل منتخب کریں۔ Excel اس فارمیٹ میں محفوظ کر سکتا ہے۔"),
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
      return text("اختر القسم والمسمى الوظيفي للمجموعة.", "Select a department and job title for the group.", "گروپ کے لیے شعبہ اور عہدہ منتخب کریں۔");
    if (mode === "import" && (!hours || !restDay))
      return text("حدد الساعات اليومية ويوم الراحة للمجموعة؛ تستطيع تعديل الاستثناءات من بطاقة العامل.", "Set daily hours and a rest day for the group; exceptions can be edited in each profile.", "گروپ کے روزانہ اوقات اور آرام کا دن مقرر کریں؛ استثنا پروفائل سے بدل سکتے ہیں۔");
    if (
      hours &&
      (!Number.isFinite(Number(hours)) ||
        Number(hours) < 0.5 ||
        Number(hours) > 24)
    )
      return text("أدخل ساعات يومية بين نصف ساعة و24 ساعة.", "Enter daily hours between 0.5 and 24.", "روزانہ اوقات 0.5 سے 24 کے درمیان درج کریں۔");
    if (mode === "import" && (!rows.length || rows.some((row) => row.error)))
      return text("حمّل الأسماء وصحح أخطاء المعاينة أولًا.", "Upload names and correct preview errors first.", "پہلے نام اپ لوڈ کریں اور غلطیاں درست کریں۔");
    if (mode === "bulk" && !selected.length)
      return text("حدد عاملًا واحدًا على الأقل.", "Select at least one worker.", "کم از کم ایک کارکن منتخب کریں۔");
    if (
      mode === "bulk" &&
      !departmentId &&
      !supervisorIds.length &&
      !hours &&
      !restDay &&
      !branch
    )
      return text("حدد التعديل الذي تريد تطبيقه على المجموعة.", "Select a change to apply to the group.", "گروپ پر لاگو کرنے کے لیے تبدیلی منتخب کریں۔");
    if (links.isError || links.isLoading)
      return text("انتظر تحميل ارتباطات المشرفين أو أعد المحاولة.", "Wait for supervisor assignments or try again.", "سپروائزر کی ذمہ داریاں لوڈ ہونے دیں یا دوبارہ کوشش کریں۔");
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
            hireDate: hireDate || null,
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
        if (!state.workerId) throw new Error(text("تعذر تحديد العامل المحفوظ.", "Could not identify the saved worker.", "محفوظ کردہ کارکن کی شناخت نہیں ہو سکی۔"));
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
              text("أكمل الساعات ويوم الراحة لهذا العامل أو حددهما للمجموعة.", "Complete this worker’s hours and rest day, or set them for the group.", "اس کارکن کے اوقات اور آرام کا دن مکمل کریں، یا گروپ کے لیے مقرر کریں۔"),
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
        text(`اكتمل ${success} عاملًا وتعذر استكمال ${failed}. راجع سبب كل سطر ثم أعد محاولة السطور غير المكتملة.`, `Completed ${success} workers; ${failed} could not be completed. Review each row and retry unfinished rows.`, `${success} کارکن مکمل ہوئے؛ ${failed} مکمل نہیں ہو سکے۔ ہر سطر چیک کریں اور نامکمل سطروں کو دوبارہ آزمائیں۔`),
      );
    else toast.success(text(`تم حفظ ${success} عاملًا بنجاح`, `Saved ${success} workers successfully`, `${success} کارکن کامیابی سے محفوظ ہوئے`));
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
        {text("استيراد الأسماء", "Import workers", "کارکن درآمد کریں")}
      </Button>}
      {canUpdate && <Button
        variant="outline"
        className="gap-2"
        disabled={!selected.length}
        onClick={() => open("bulk")}
      >
        <Users className="h-4 w-4" />
        {text("تعديل المجموعة", "Edit group", "گروپ میں ترمیم")} {selected.length ? `(${selected.length})` : ""}
      </Button>}
      <Dialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open && !busy) setMode(null);
        }}
      >
        <DialogContent
          dir={language === "en" ? "ltr" : "rtl"}
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "import"
                ? text("استيراد العمال وربطهم", "Import and assign workers", "کارکن درآمد اور مقرر کریں")
                : text(`تعديل ${selected.length} عاملًا دفعة واحدة`, `Edit ${selected.length} workers at once`, `ایک ساتھ ${selected.length} کارکنوں میں ترمیم`)}
            </DialogTitle>
            <DialogDescription>
              {mode === "import"
                ? text("ارفع الأسماء، راجعها، ثم حدد البيانات المشتركة. تستطيع تخصيص الاستثناءات من بطاقة كل عامل بعد الحفظ.", "Upload and review names, then choose shared details. Exceptions can be changed in each worker’s profile after saving.", "نام اپ لوڈ اور جانچیں، پھر مشترک تفصیلات منتخب کریں۔ محفوظ کرنے کے بعد ہر پروفائل میں استثنا بدل سکتے ہیں۔")
                : text("تُطبق القيم التي تحددها فقط، وتبقى بقية البيانات وارتباطات المشرفين محفوظة.", "Only selected values are applied; other details and supervisor assignments remain.", "صرف منتخب اقدار لاگو ہوں گی؛ باقی تفصیلات اور سپروائزر کی ذمہ داریاں برقرار رہیں گی۔")}
            </DialogDescription>
          </DialogHeader>
          {mode === "import" && (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                aria-label={text("ملف أسماء العمال", "Worker names file", "کارکنوں کے ناموں کی فائل")}
                accept=".csv,.tsv"
                disabled={busy || started}
                className="min-w-56 flex-1"
                onChange={(event) => readFile(event.target.files?.[0])}
              />
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="ml-2 h-4 w-4" />
                {text("تحميل القالب", "Download template", "ٹیمپلیٹ ڈاؤن لوڈ کریں")}
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                {text("CSV / TSV بترميز UTF-8، حتى 500 عامل. الأعمدة: الرقم الوظيفي، الاسم بالعربية، رقم البصمة ورقم الهاتف (اختياريان). احفظ أرقام الهاتف كنص في Excel للحفاظ على الصفر في البداية.", "UTF-8 CSV / TSV, up to 500 workers. Columns: employee ID, Arabic name, fingerprint ID and phone (last two optional). Save phone numbers as text in Excel to keep leading zeros.", "UTF-8 CSV / TSV، زیادہ سے زیادہ 500 کارکن۔ کالم: ملازم نمبر، عربی نام، فنگر پرنٹ نمبر اور فون (آخری دو اختیاری)۔ شروع کا صفر رکھنے کے لیے Excel میں فون نمبر متن کے طور پر محفوظ کریں۔")}
              </p>
            </div>
          )}
          <fieldset
            disabled={busy || started}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-2">
              <Label>{text("القسم", "Department", "شعبہ")} {mode === "bulk" && text("(اختياري)", "(optional)", "(اختیاری)")}</Label>
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
                      mode === "bulk" ? text("إبقاء القسم الحالي", "Keep current department", "موجودہ شعبہ برقرار رکھیں") : text("اختر القسم", "Select department", "شعبہ منتخب کریں")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {reference.data?.departments.map((department) => (
                    <SelectItem
                      key={department.id}
                      value={String(department.id)}
                    >
                      {normalizeDigits(localizedName(department, language))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{text("المسمى الوظيفي", "Job title", "عہدہ")}</Label>
              <Select
                value={jobTitleId}
                disabled={!departmentId}
                onValueChange={setJobTitleId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      departmentId ? text("اختر المسمى", "Select job title", "عہدہ منتخب کریں") : text("اختر القسم أولًا", "Select department first", "پہلے شعبہ منتخب کریں")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {jobs.data?.map((job) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {normalizeDigits(localizedJobTitle(job, language))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!!departmentId &&
                !jobs.isLoading &&
                !jobs.data?.length &&
                !jobs.isError && (
                  <p className="text-xs text-destructive">
                    {text("لا توجد مسميات لهذا القسم.", "No job titles exist for this department.", "اس شعبے کے لیے کوئی عہدہ نہیں۔")}{" "}
                    <a
                      className="underline"
                      href="/settings?section=job-titles"
                    >
                      {text("إضافة مسمى من التهيئة", "Add a job title in setup", "ترتیبات میں عہدہ شامل کریں")}
                    </a>
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <Label>{text("مركز التكلفة", "Cost center", "لاگت مرکز")}</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      mode === "bulk" ? text("إبقاء المركز الحالي", "Keep current center", "موجودہ مرکز برقرار رکھیں") : text("اختياري", "Optional", "اختیاری")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{text("غير محدد", "Not set", "مقرر نہیں")}</SelectItem>
                  {branches.data?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.code}>
                      {normalizeDigits(localizedName(branch, language))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{text("الساعات اليومية", "Daily hours", "روزانہ اوقات")}</Label>
              <Input
                type="number"
                min="0.5"
                max="24"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                placeholder={
                  mode === "bulk" ? text("إبقاء الساعات الحالية", "Keep current hours", "موجودہ اوقات برقرار رکھیں") : text("أدخل ساعات العمل", "Enter work hours", "کام کے اوقات درج کریں")
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{text("يوم الراحة", "Rest day", "آرام کا دن")}</Label>
              <Select value={restDay} onValueChange={setRestDay}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      mode === "bulk" ? text("إبقاء اليوم الحالي", "Keep current day", "موجودہ دن برقرار رکھیں") : text("اختر اليوم", "Select day", "دن منتخب کریں")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {[6, 0, 1, 2, 3, 4, 5].map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {dayLabel(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "import" && (
              <div className="space-y-2">
                <Label>{text("تاريخ التعيين للمجموعة (اختياري)", "Group hire date (optional)", "گروپ کی ملازمت کی تاریخ (اختیاری)")}</Label>
                <Input
                  type="date"
                  value={hireDate}
                  onChange={(event) => setHireDate(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>{text("المشرفون الذين تريد إضافتهم", "Supervisors to add", "شامل کیے جانے والے سپروائزر")}</Label>
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
                {text("الإضافة تحافظ على المشرفين الحاليين. لإنهاء ربط مشرف بعامل معين، افتح بطاقة العامل.", "Adding supervisors retains existing assignments. To end an assignment, open the worker’s profile.", "سپروائزر شامل کرنے سے موجودہ ذمہ داریاں برقرار رہیں گی۔ ذمہ داری ختم کرنے کے لیے کارکن کا پروفائل کھولیں۔")}
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
                {text(`معاينة ${rows.length} عاملًا — يمكن تصحيح الأسماء والأرقام قبل الحفظ`, `Preview ${rows.length} workers — names and numbers can be corrected before saving`, `${rows.length} کارکنوں کا پیش نظارہ — محفوظ کرنے سے پہلے نام اور نمبر درست کیے جا سکتے ہیں`)}
              </p>
              {rows.map((row, index) => (
                <div key={index} className="space-y-1 rounded-lg border p-2">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      aria-label={text(`الرقم الوظيفي للسطر ${index + 1}`, `Employee ID for row ${index + 1}`, `سطر ${index + 1} کا ملازم نمبر`)}
                      dir="ltr"
                      value={row.employeeId}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "employeeId", event.target.value)
                      }
                    />
                    <Input
                      aria-label={text(`اسم العامل في السطر ${index + 1}`, `Worker name for row ${index + 1}`, `سطر ${index + 1} کا کارکن نام`)}
                      value={row.nameAr}
                      disabled={busy || !!progress[index]?.workerId}
                      onChange={(event) =>
                        editRow(index, "nameAr", event.target.value)
                      }
                    />
                    <Input
                      aria-label={text(`رقم البصمة للسطر ${index + 1}`, `Fingerprint ID for row ${index + 1}`, `سطر ${index + 1} کا فنگر پرنٹ نمبر`)}
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
                      aria-label={text(`رقم هاتف العامل للسطر ${index + 1}`, `Phone number for row ${index + 1}`, `سطر ${index + 1} کا فون نمبر`)}
                      dir="ltr"
                      maxLength={32}
                      placeholder={text("رقم الهاتف (اختياري)", "Phone number (optional)", "فون نمبر (اختیاری)")}
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
                      {text("تم الحفظ — يمكن فتح بطاقة العامل من القائمة.", "Saved — the worker profile can be opened from the list.", "محفوظ ہو گیا — فہرست سے کارکن کا پروفائل کھولا جا سکتا ہے۔")}
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
                  {normalizeDigits(localizedName(worker, language))}
                  {progress[index]?.done ? text(" — تم الحفظ", " — Saved", " — محفوظ ہو گیا") : ""}
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
              {text("حُفظت نتائج السطور أعلاه. إعادة المحاولة تُكمل السطور المتعثرة فقط بنفس البيانات.", "The results above were saved. Retrying completes only unfinished rows with the same data.", "اوپر کی سطروں کے نتائج محفوظ ہیں۔ دوبارہ کوشش صرف نامکمل سطروں کو انہی معلومات سے مکمل کرے گی۔")}
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
                ? text("جارٍ حفظ المجموعة...", "Saving group...", "گروپ محفوظ ہو رہا ہے...")
                : started
                  ? text("استكمال السطور غير المكتملة", "Complete unfinished rows", "نامکمل سطریں مکمل کریں")
                  : mode === "import"
                    ? text("استيراد وحفظ المجموعة", "Import and save group", "گروپ درآمد اور محفوظ کریں")
                    : text("تطبيق التعديلات", "Apply changes", "تبدیلیاں لاگو کریں")}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setMode(null)}
            >
              {text("إغلاق", "Close", "بند کریں")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
