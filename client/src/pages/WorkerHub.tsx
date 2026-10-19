import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { WorkerSupervisorLinks } from "@/components/workers/WorkerSupervisorLinks";
import { WorkerArchiveAction } from "@/components/workers/WorkerArchiveAction";
import { WorkerAbsences } from "@/components/leaves/WorkerAbsences";
import { WorkerOvertime } from "@/components/overtime/WorkerOvertime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  CalendarDays,
  CalendarX2,
  Check,
  Clock3,
  Edit,
  Loader2,
  Trash2,
  User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { riyadhDateKey } from "@/lib/operational-date";
import { formatDateTime, normalizeDigits } from "@shared/display-format";
import { workerLanguageLabel } from "@shared/worker-languages";
import { permits } from "@shared/access-control";

const WEEKDAY_LABELS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
const statusLabels = {
  active: "نشط",
  inactive: "غير نشط",
  on_leave: "إجازة",
  terminated: "منتهي الخدمة",
};
function todayStr() {
  return riyadhDateKey();
}
function formatDate(value: string | Date | null | undefined) {
  return value
    ? formatDateTime(
        value,
        {
          timeZone: "Asia/Riyadh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
        "ar-SA-u-ca-gregory",
      )
    : "غير مسجل";
}
function minutesToHoursLabel(min: number) {
  const value = Math.round(Math.abs(min));
  return `${min < 0 ? "-" : ""}${Math.floor(value / 60)}س${value % 60 ? ` ${value % 60}د` : ""}`;
}

export default function WorkerHub() {
  const [, params] = useRoute("/workers/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || permits(user?.permissions ?? [], "workers:update");
  const [activeTab, setActiveTab] = useState("duty");
  const workerId = Number(params?.id ?? 0);
  const validId = Number.isInteger(workerId) && workerId > 0;
  const workerQuery = trpc.workers.getById.useQuery(
    { id: workerId },
    { enabled: validId },
  );
  const reference = trpc.workers.referenceData.useQuery(undefined, {
    enabled: validId,
  });
  const worker = workerQuery.data;
  const jobs = trpc.workers.jobTitlesByDepartment.useQuery(
    { departmentId: worker?.departmentId ?? 0 },
    { enabled: !!worker?.departmentId },
  );
  const department = reference.data?.departments.find(
    (item) => item.id === worker?.departmentId,
  );
  const job = jobs.data?.find((item) => item.id === worker?.jobTitleId);
  if (!validId || workerQuery.isError || (!workerQuery.isLoading && !worker))
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>بطاقة العامل</CardTitle>
            <CardDescription>
              {workerQuery.error?.message ?? "اختر عاملًا من قائمة العمال."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/workers")}>
              فتح قائمة العمال
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  if (workerQuery.isLoading || !worker)
    return (
      <DashboardLayout>
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </DashboardLayout>
    );
  return (
    <DashboardLayout>
      <div className="space-y-5" dir="rtl">
        <Button variant="outline" onClick={() => navigate("/workers")}>
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة إلى العمال
        </Button>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">
                {normalizeDigits(worker.nameAr)}
              </CardTitle>
              <CardDescription className="mt-2">
                {normalizeDigits(worker.employeeId)} ·{" "}
                {normalizeDigits(department?.nameAr ?? "قسم غير محدد")} ·{" "}
                {job?.titleAr ?? "مسمى غير محدد"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{statusLabels[worker.status]}</Badge>
              <WorkerArchiveAction
                worker={worker}
                variant="outline"
                onCompleted={(restored) => {
                  if (!restored) navigate("/workers");
                }}
              />
            </div>
          </CardHeader>
        </Card>
        <Tabs dir="rtl" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="duty" className="gap-2 py-3">
              <Clock3 className="h-4 w-4" />
              الدوام
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2 py-3">
              <User className="h-4 w-4" />
              البيانات والارتباطات
            </TabsTrigger>
          </TabsList>
          <TabsContent value="duty" className="space-y-5 pt-3">
            <WorkerTimelineCard
              workerId={workerId}
              canManage={canManage}
              onSetup={() => setActiveTab("profile")}
            />
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">
                الجدول المسجل للعامل
              </summary>
              <div className="mt-4">
                <WorkerAssignmentsCard workerId={workerId} />
              </div>
            </details>
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">
                سجل الحضور والانصراف
              </summary>
              <div className="mt-4">
                {canManage ? (
                  <WorkerAttendanceHistory workerId={workerId} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    الساعات الفعلية ظاهرة في ملخص الدوام. فتح سجلات البصمة
                    التفصيلية متاح للشؤون الإدارية حسب الصلاحية الحالية.
                  </p>
                )}
              </div>
            </details>
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">
                الإجازات
              </summary>
              <div className="mt-4">
                <WorkerAbsences workerId={workerId} />
              </div>
            </details>
            <WorkerOvertime workerId={workerId} />
          </TabsContent>
          <TabsContent value="profile" className="space-y-5 pt-3">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>بيانات العامل</CardTitle>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/workers?edit=${worker.id}`)}
                  >
                    <Edit className="ml-2 h-4 w-4" />
                    تعديل البيانات
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["الرقم الوظيفي", worker.employeeId],
                  ["رقم البصمة", worker.fingerprintId],
                  ["رقم هاتف العامل", worker.phoneNumber],
                  ["الاسم بالعربية", worker.nameAr],
                  ["الاسم بالإنجليزية", worker.nameEn],
                  ["الجنسية", worker.nationality],
                  ["لغة التواصل", workerLanguageLabel(worker.preferredLanguage)],
                  ["موقع العمل", reference.data?.locations.find(location => location.id === worker.locationId)?.nameAr],
                  ["تاريخ التعيين", formatDate(worker.hireDate)],
                  ["القسم", department?.nameAr],
                  ["المسمى الوظيفي", job?.titleAr],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p
                      className="mt-2 font-medium"
                      dir={label === "رقم هاتف العامل" ? "ltr" : undefined}
                    >
                      {normalizeDigits(value || "غير مسجل")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            {canManage && (
              <WorkerOrganizationPath departmentId={worker.departmentId} />
            )}
            <WorkerSupervisorLinks workerId={workerId} canManage={canManage} />
            <WorkerScheduleCardForm
              key={workerId}
              workerId={workerId}
              canManage={canManage}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function WorkerOrganizationPath({ departmentId }: { departmentId: number }) {
  const branches = trpc.orgStructure.listBranches.useQuery({
    activeOnly: true,
  });
  const locations = trpc.orgStructure.listLocations.useQuery({
    activeOnly: true,
  });
  const branchLinks = trpc.orgStructure.listBranchLocationLinks.useQuery();
  const departmentLinks =
    trpc.orgStructure.listLocationDepartmentLinks.useQuery();
  const errors = [
    branches.error,
    locations.error,
    branchLinks.error,
    departmentLinks.error,
  ].filter(Boolean);
  const paths = (departmentLinks.data ?? [])
    .filter((link) => link.departmentId === departmentId)
    .flatMap((link) => {
      const location = locations.data?.find(
        (item) => item.id === link.locationId,
      );
      if (!location) return [];
      const centers = (branchLinks.data ?? [])
        .filter((item) => item.locationId === location.id)
        .flatMap(
          (item) =>
            branches.data?.find((branch) => branch.id === item.branchId) ?? [],
        );
      return centers.length
        ? centers.map((center) => `${center.nameAr} ← ${location.nameAr}`)
        : [location.nameAr];
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>المراكز والمواقع المرتبطة بالقسم</CardTitle>
        <CardDescription>
          تُستنتج من الهيكل التشغيلي. القسم المشترك قد يظهر في أكثر من موقع.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errors.length ? (
          <p className="text-sm text-destructive">
            تعذر تحميل الهيكل التشغيلي.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {paths.length ? (
              paths.map((path) => (
                <Badge key={path} variant="outline">
                  {path}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                لم يُربط هذا القسم بموقع بعد. يمكن استكمال الربط من التهيئة.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkerTimelineCard({
  workerId,
  canManage,
  onSetup,
}: {
  workerId: number;
  canManage: boolean;
  onSetup: () => void;
}) {
  const [date, setDate] = useState(todayStr);
  const query = trpc.schedules.getWorkerTimeline.useQuery(
    { workerId, refDate: date },
    { enabled: /^\d{4}-\d{2}-\d{2}$/.test(date) },
  );
  const data = query.data;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>ملخص الدوام</CardTitle>
            <CardDescription className="mt-2">
              الأسبوع من الأحد إلى السبت. الراحة نصف ساعة منفصلة عن ساعات
              العمل.
            </CardDescription>
          </div>
          <Input
            aria-label="تاريخ ملخص الدوام"
            type="date"
            className="w-auto"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
        ) : !data?.hasCard ? (
          <div className="rounded-lg border border-dashed p-5">
            <p>أكمل ساعات العامل ويوم راحته لعرض الرصيد.</p>
            {canManage && (
              <Button className="mt-3" onClick={onSetup}>
                إعداد ساعات العامل
              </Button>
            )}
          </div>
        ) : (
          <>
            {(data.isRestDayToday || data.isOnLeaveToday) && (
              <Badge variant="secondary">
                {data.nonWorkingDayLabel ??
                  (data.isOnLeaveToday ? "إجازة مسجلة" : "راحة أسبوعية")}{" "}
                — لا توجد ساعات مطلوبة لهذا اليوم
              </Badge>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "اليوم", value: data.day },
                { label: "الأسبوع", value: data.week },
                { label: "الشهر", value: data.month },
              ].map(({ label, value }) => (
                <div className="rounded-lg border p-4" key={label}>
                  <h3 className="font-semibold">{label}</h3>
                  <Progress
                    className="my-3 h-2"
                    value={
                      value.requiredMinutes
                        ? Math.min(
                            100,
                            (value.scheduledMinutes / value.requiredMinutes) *
                              100,
                          )
                        : 0
                    }
                  />
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">المطلوب</dt>
                    <dd>{minutesToHoursLabel(value.requiredMinutes)}</dd>
                    <dt className="text-muted-foreground">المخطط</dt>
                    <dd>{minutesToHoursLabel(value.scheduledMinutes)}</dd>
                    <dt className="text-muted-foreground">الفعلي المسجل</dt>
                    <dd>{minutesToHoursLabel(value.actualMinutes)}</dd>
                    <dt className="text-muted-foreground">المعتمد من الحضور</dt>
                    <dd>{value.approvedMinutes == null ? "—" : minutesToHoursLabel(value.approvedMinutes)}</dd>
                    <dt className="font-semibold">المتاح للجدولة</dt>
                    <dd
                      className={
                        value.scheduledMinutes > value.requiredMinutes
                          ? "text-destructive"
                          : "font-semibold text-primary"
                      }
                    >
                      {minutesToHoursLabel(value.remainingMinutes)}
                    </dd>
                  </dl>
                  {value.scheduledMinutes > value.requiredMinutes && (
                    <p className="mt-3 text-xs text-destructive">
                      المخطط يتجاوز المطلوب بمقدار{" "}
                      {minutesToHoursLabel(
                        value.scheduledMinutes - value.requiredMinutes,
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              الفعلي من سجلات الحضور فقط؛ غياب السجل لا يحوّل الجدول إلى حضور.
              المعتمد يحتسب الوقت الفعلي داخل الفترات الرسمية، والزيادة الفعلية
              المقبولة نهائيًا من الشؤون الإدارية فقط، بعد استبعاد الراحة.
            </p>
            <WorkerDayTimeline workerId={workerId} date={date} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WorkerDayTimeline({
  workerId,
  date,
}: {
  workerId: number;
  date: string;
}) {
  const query = trpc.schedules.listAssignments.useQuery({ workerId });
  const links = trpc.supervisorAssignments.listAssignments.useQuery({
    activeOnly: false,
  });
  const periods = (query.data ?? [])
    .filter(
      (item) =>
        String(
          item.workDate instanceof Date
            ? item.workDate.toISOString().slice(0, 10)
            : item.workDate,
        ).slice(0, 10) === date &&
        item.status !== "cancelled" &&
        item.status !== "transferred",
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (query.isError)
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">فترات اليوم المخططة</h3>
      {periods.length ? (
        periods.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-r-4 border-r-primary bg-muted/40 p-3"
          >
            <span dir="ltr" className="font-semibold">
              {item.startTime.slice(0, 5)} — {item.endTime.slice(0, 5)}
              {item.crossesMidnight ? " (+1)" : ""}
            </span>
            <span className="text-sm text-muted-foreground">
              {links.data?.find(
                (link) =>
                  link.workerId === workerId &&
                  link.supervisorId === item.supervisorId,
              )?.supervisorName ?? "فترة مجدولة"}{" "}
              · {minutesToHoursLabel(item.plannedMinutes)}
            </span>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          لا توجد فترات مسجلة لهذا اليوم.
        </p>
      )}
    </div>
  );
}

function WorkerAssignmentsCard({ workerId }: { workerId: number }) {
  const [, navigate] = useLocation();
  const query = trpc.schedules.listAssignments.useQuery({ workerId });
  const labels: Record<string, string> = {
    planned: "مخطط",
    confirmed: "مؤكد",
    completed: "منفذ",
    cancelled: "ملغى",
    transferred: "منقول",
  };
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/schedules?worker=${workerId}`)}
      >
        فتح الجدول الأسبوعي
      </Button>
      {query.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : query.isError ? (
        <p className="text-destructive">{query.error.message}</p>
      ) : query.data?.length ? (
        [...query.data]
          .sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)))
          .slice(0, 50)
          .map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span>{formatDate(item.workDate)}</span>
              <span dir="ltr">
                {item.startTime.slice(0, 5)} — {item.endTime.slice(0, 5)}
                {item.crossesMidnight ? " (+1)" : ""}
              </span>
              <Badge variant="secondary">
                {labels[item.status] ?? item.status}
              </Badge>
            </div>
          ))
      ) : (
        <p className="text-sm text-muted-foreground">
          لا توجد فترات مجدولة بعد.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        تُعرض آخر 50 فترة مسجلة. إعداد الفترات وتعديلها من الجدول الأسبوعي.
      </p>
    </div>
  );
}

function WorkerAttendanceHistory({ workerId }: { workerId: number }) {
  const [from, setFrom] = useState(() => `${todayStr().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayStr);
  const [offset, setOffset] = useState(0);
  const valid = !!from && !!to && from <= to;
  const query = trpc.attendance.getByDateRange.useQuery(
    {
      workerId,
      startDate: new Date(`${from}T00:00:00Z`),
      endDate: new Date(`${to}T00:00:00Z`),
      limit: 50,
      offset,
    },
    { enabled: valid },
  );
  const time = (value: Date | null) =>
    value
      ? formatDateTime(
          value,
          {
            timeZone: "Asia/Riyadh",
            hour: "2-digit",
            minute: "2-digit",
          },
          "ar-SA",
        )
      : "—";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>من تاريخ</Label>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div>
          <Label>إلى تاريخ</Label>
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>
      {!valid ? (
        <p className="text-sm text-destructive">اختر مدى تواريخ صحيحًا.</p>
      ) : query.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : query.data?.length ? (
        <>
          {query.data.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"
            >
              <span>{formatDate(row.attendanceDate)}</span>
              <span>حضور: {time(row.checkInTime)}</span>
              <span>انصراف: {time(row.checkOutTime)}</span>
              <span>
                {row.actualHours === null
                  ? "قيد الدوام"
                  : minutesToHoursLabel(
                      Math.round(Number(row.actualHours) * 60),
                    )}
              </span>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset((value) => Math.max(0, value - 50))}
            >
              السابق
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={query.data.length < 50}
              onClick={() => setOffset((value) => value + 50)}
            >
              التالي
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          لا توجد سجلات حضور في هذا المدى.
        </p>
      )}
    </div>
  );
}

function WorkerScheduleCardForm({
  workerId,
  canManage,
}: {
  workerId: number;
  canManage: boolean;
}) {
  const utils = trpc.useUtils();
  const query = trpc.schedules.getWorkerCard.useQuery({ workerId });
  const branches = trpc.orgStructure.listBranches.useQuery(
    { activeOnly: true },
    { enabled: canManage },
  );
  const [hours, setHours] = useState("");
  const [branch, setBranch] = useState("none");
  const [rest, setRest] = useState("none");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!query.isSuccess) return;
    setHours(query.data ? String(query.data.requiredHoursPerDay) : "");
    setBranch(query.data?.branch ?? "none");
    setRest(
      query.data?.weeklyRestDay == null
        ? "none"
        : String(query.data.weeklyRestDay),
    );
  }, [query.isSuccess, query.data]);
  const save = trpc.workers.updateDutySettings.useMutation({
    onSuccess: async () => {
      setError("");
      toast.success("تم حفظ الساعات ويوم الراحة");
      await Promise.all([
        utils.schedules.getWorkerCard.invalidate({ workerId }),
        utils.schedules.getWorkerTimeline.invalidate(),
      ]);
    },
    onError: (error) => setError(error.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>الساعات ويوم الراحة</CardTitle>
        <CardDescription>
          الساعات المطلوبة خاصة بهذا العامل. إعداد فترات العمل من الجدول
          الأسبوعي.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="worker-hours">ساعات العمل اليومية</Label>
                <Input
                  id="worker-hours"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.25"
                  value={hours}
                  disabled={!canManage}
                  placeholder="حدد ساعات العامل"
                  onChange={(event) => setHours(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>يوم الراحة المعتاد</Label>
                <Select
                  value={rest}
                  disabled={!canManage}
                  onValueChange={setRest}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {[6, 0, 1, 2, 3, 4, 5].map((day) => (
                      <SelectItem value={String(day)} key={day}>
                        {WEEKDAY_LABELS[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>مركز التكلفة</Label>
                {canManage ? (
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المركز" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">غير محدد</SelectItem>
                      {branch !== "none" &&
                        !branches.data?.some(
                          (item) => item.code === branch,
                        ) && (
                          <SelectItem value={branch}>
                            {branch} (مسجل سابقًا)
                          </SelectItem>
                        )}
                      {branches.data?.map((item) => (
                        <SelectItem value={item.code} key={item.id}>
                          {item.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input disabled value={query.data?.branch ?? "غير محدد"} />
                )}
                {branches.isError && canManage && (
                  <p className="text-xs text-destructive">
                    تعذر تحميل المراكز؛ سيُحفظ المركز الحالي كما هو.
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              الراحة: 30 دقيقة منفصلة عن ساعات العمل. يحتسب المطلوب الأسبوعي
              والشهري حسب أيام العمل مع استبعاد الراحة والإجازات المسجلة.
            </p>
            {canManage && (
              <p className="text-xs text-muted-foreground">
                تعديل يوم الراحة هنا يغيّر اليوم المعتاد في البطاقة. تغيير أسبوع
                معين يُراجع ضمن جدوله.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {canManage && (
              <Button
                disabled={save.isPending}
                onClick={() => {
                  const numeric = Number(hours);
                  if (
                    !hours ||
                    !Number.isFinite(numeric) ||
                    numeric < 0.5 ||
                    numeric > 24
                  ) {
                    setError("أدخل ساعات العمل اليومية بين نصف ساعة و24 ساعة.");
                    return;
                  }
                  if (rest === "none") {
                    setError("اختر يوم الراحة الأسبوعية للعامل.");
                    return;
                  }
                  save.mutate({
                    workerId,
                    requiredDailyHours: numeric,
                    weeklyRestDay: Number(rest),
                    branch: branch === "none" ? null : branch,
                  });
                }}
              >
                {save.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="ml-2 h-4 w-4" />
                )}
                حفظ الساعات والراحة
              </Button>
            )}
            {query.data?.p1Start && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  النمط الافتراضي المسجل سابقًا
                </summary>
                <p className="mt-3" dir="ltr">
                  {query.data.p1Start.slice(0, 5)} —{" "}
                  {query.data.p1End?.slice(0, 5)}
                  {query.data.p2Start
                    ? ` / ${query.data.p2Start.slice(0, 5)} — ${query.data.p2End?.slice(0, 5)}`
                    : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  حفظ الساعات والراحة يحافظ على هذا النمط والفترات الموجودة.
                  ترتيب الفترات الجديدة من الجدول الأسبوعي.
                </p>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

