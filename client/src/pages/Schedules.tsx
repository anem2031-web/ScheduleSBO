import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Loader2,
  Lock,
  LockOpen,
  MoonStar,
  Plus,
  RefreshCcw,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { WeeklyBoard } from "@/components/schedules/WeeklyBoard";
import { formatDateTime } from "@shared/display-format";
import { permits } from "@shared/access-control";

/**
 * صفحة إدارة الجداول (S2/S3)
 * فترات الجداول — قوالب الورديات — التكليفات
 */

const PERIOD_STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  draft: { label: "مسودة", variant: "secondary" },
  published: { label: "منشورة", variant: "default" },
  locked: { label: "مقفلة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
  archived: { label: "مؤرشفة", variant: "outline" },
};

const ASSIGNMENT_STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  planned: { label: "مخطط", variant: "secondary" },
  confirmed: { label: "مؤكد", variant: "default" },
  completed: { label: "منفذ", variant: "default" },
  cancelled: { label: "ملغى", variant: "destructive" },
  transferred: { label: "منقول", variant: "outline" },
};

function fmtDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return formatDateTime(
    d,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
    "ar-SA-u-ca-gregory",
  );
}

function fmtTime(t: string): string {
  return t.slice(0, 5);
}

function minutesToHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}س ${m}د` : `${h}س`;
}

export default function Schedules() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canCreate = permits(user?.permissions ?? [], "schedule:create");
  const canApprove = permits(user?.permissions ?? [], "schedule:approve");
  const canLock = permits(user?.permissions ?? [], "schedule:lock");

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <WeeklyBoard />
        {canCreate && (
          <details className="rounded-xl border bg-background p-4">
            <summary className="cursor-pointer text-sm font-medium">
              إدارة متقدمة للجداول والورديات
            </summary>
            <p className="my-3 text-xs text-muted-foreground">
              للإدارة عند الحاجة إلى إدارة الفترات أو القوالب القديمة. إعداد
              الأسبوع المعتاد يتم من الجدول أعلاه.
            </p>
            <Tabs defaultValue="periods" className="w-full">
              <TabsList>
                <TabsTrigger value="periods" className="gap-2">
                  <CalendarDays className="h-4 w-4" />
                  فترات الجداول
                </TabsTrigger>
                <TabsTrigger value="shifts" className="gap-2">
                  <Clock className="h-4 w-4" />
                  الورديات
                </TabsTrigger>
                <TabsTrigger value="assignments" className="gap-2">
                  <Users className="h-4 w-4" />
                  التكليفات
                </TabsTrigger>
              </TabsList>

              <TabsContent value="periods" className="mt-4">
                <PeriodsTab
                  canCreate={canCreate}
                  canApprove={canApprove}
                  canLock={canLock}
                />
              </TabsContent>
              <TabsContent value="shifts" className="mt-4">
                <ShiftTemplatesTab canCreate={canCreate} />
              </TabsContent>
              <TabsContent value="assignments" className="mt-4">
                <AssignmentsTab canCreate={canCreate} />
              </TabsContent>
            </Tabs>
          </details>
        )}
      </div>
    </DashboardLayout>
  );
}

// ===========================================================================
// فترات الجداول
// ===========================================================================

function PeriodsTab({
  canCreate,
  canApprove,
  canLock,
}: {
  canCreate: boolean;
  canApprove: boolean;
  canLock: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: periods, isLoading } = trpc.schedules.listPeriods.useQuery({});

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState("");

  const invalidate = () => utils.schedules.listPeriods.invalidate();

  const createMutation = trpc.schedules.createPeriod.useMutation({
    onSuccess: () => {
      setOpen(false);
      setName("");
      setStartDate("");
      setEndDate("");
      setFormError("");
      invalidate();
    },
    onError: (e) => setFormError(e.message),
  });
  const publishMutation = trpc.schedules.publishPeriod.useMutation({
    onSuccess: invalidate,
  });
  const lockMutation = trpc.schedules.lockPeriod.useMutation({
    onSuccess: invalidate,
  });
  const cancelMutation = trpc.schedules.cancelPeriod.useMutation({
    onSuccess: invalidate,
  });
  const reopenMutation = trpc.schedules.reopenPeriod.useMutation({
    onSuccess: invalidate,
  });
  const [rolloutReport, setRolloutReport] = useState<{
    periodId: number;
    created: number;
    skipped: number;
    workersProcessed: number;
    workersWithoutCard: number;
  } | null>(null);
  const rolloutMutation = trpc.schedules.rolloutPeriodFromCards.useMutation({
    onSuccess: (report, variables) => {
      setRolloutReport({
        periodId: variables.periodId,
        created: report.created,
        skipped: report.skipped,
        workersProcessed: report.workersProcessed,
        workersWithoutCard: report.workersWithoutCard,
      });
      invalidate();
    },
  });

  const askReason = (label: string): string | null => {
    const reason = window.prompt(label);
    if (reason === null) return null;
    if (!reason.trim()) {
      window.alert("السبب مطلوب");
      return null;
    }
    return reason.trim();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>فترات الجداول</CardTitle>
          <CardDescription>
            أنشئ فترة كمسودة، ثم انشرها لبدء التكليفات، وأقفلها عند انتهائها
          </CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <CalendarPlus className="h-4 w-4" />
                فترة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إنشاء فترة جدول</DialogTitle>
                <DialogDescription>
                  الأسبوع المعتاد يبدأ الأحد وينتهي السبت، ويمكن للإدارة اختيار
                  مدى آخر
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="period-name">اسم الفترة</Label>
                  <Input
                    id="period-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: أسبوع 26 يوليو"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="period-start">تاريخ البداية</Label>
                    <Input
                      id="period-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="period-end">تاريخ النهاية</Label>
                    <Input
                      id="period-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={() =>
                    createMutation.mutate({ name, startDate, endDate })
                  }
                  disabled={
                    createMutation.isPending || !name || !startDate || !endDate
                  }
                  className="gap-2"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  إنشاء الفترة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {rolloutReport && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <p className="font-semibold">
              تم الترحيل من البطاقات — الفترة #{rolloutReport.periodId}
            </p>
            <p className="mt-1 text-indigo-700">
              {rolloutReport.workersProcessed} عاملًا مُعالجًا ·{" "}
              {rolloutReport.created} تكليفًا أُنشئ · {rolloutReport.skipped}{" "}
              تُخطي (تعارض/إجازة/راحة)
            </p>
            {rolloutReport.workersWithoutCard > 0 && (
              <p className="mt-1 font-semibold text-amber-700">
                ⚠️ {rolloutReport.workersWithoutCard} عامل لم يُعالَج إطلاقًا
                بسبب بطاقة دوام غير مكتملة (تحقق من وقت بداية/نهاية الفترة
                الأولى)
              </p>
            )}
          </div>
        )}
        {isLoading ? (
          <LoadingRow />
        ) : !periods?.length ? (
          <EmptyState text="لا توجد فترات بعد — أنشئ أول فترة جدول للبدء" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">من</TableHead>
                <TableHead className="text-right">إلى</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => {
                const status = PERIOD_STATUS_LABELS[p.status] ?? {
                  label: p.status,
                  variant: "outline" as const,
                };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{fmtDate(p.startDate)}</TableCell>
                    <TableCell>{fmtDate(p.endDate)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {canCreate &&
                          ["draft", "published"].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={rolloutMutation.isPending}
                              onClick={() =>
                                rolloutMutation.mutate({ periodId: p.id })
                              }
                            >
                              {rolloutMutation.isPending &&
                              rolloutMutation.variables?.periodId === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCcw className="h-3.5 w-3.5" />
                              )}
                              ترحيل من البطاقات
                            </Button>
                          )}
                        {canApprove && p.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={publishMutation.isPending}
                            onClick={() =>
                              publishMutation.mutate({ periodId: p.id })
                            }
                          >
                            <Send className="h-3.5 w-3.5" />
                            نشر
                          </Button>
                        )}
                        {canLock && p.status === "published" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={lockMutation.isPending}
                            onClick={() =>
                              lockMutation.mutate({ periodId: p.id })
                            }
                          >
                            <Lock className="h-3.5 w-3.5" />
                            إقفال
                          </Button>
                        )}
                        {canLock && p.status === "locked" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={reopenMutation.isPending}
                            onClick={() => {
                              const reason = askReason("سبب إعادة الفتح:");
                              if (reason)
                                reopenMutation.mutate({
                                  periodId: p.id,
                                  reason,
                                });
                            }}
                          >
                            <LockOpen className="h-3.5 w-3.5" />
                            إعادة فتح
                          </Button>
                        )}
                        {canApprove &&
                          ["draft", "published"].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-red-600 hover:text-red-700"
                              disabled={cancelMutation.isPending}
                              onClick={() => {
                                const reason = askReason("سبب الإلغاء:");
                                if (reason)
                                  cancelMutation.mutate({
                                    periodId: p.id,
                                    reason,
                                  });
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              إلغاء
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// قوالب الورديات
// ===========================================================================

function ShiftTemplatesTab({ canCreate }: { canCreate: boolean }) {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } =
    trpc.schedules.listShiftTemplates.useQuery({});

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:00");
  const [formError, setFormError] = useState("");

  const invalidate = () => utils.schedules.listShiftTemplates.invalidate();

  const createMutation = trpc.schedules.createShiftTemplate.useMutation({
    onSuccess: () => {
      setOpen(false);
      setCode("");
      setNameAr("");
      setNameEn("");
      setFormError("");
      invalidate();
    },
    onError: (e) => setFormError(e.message),
  });
  const toggleMutation = trpc.schedules.setShiftTemplateActive.useMutation({
    onSuccess: invalidate,
  });

  const crossesMidnightPreview = useMemo(() => {
    if (!startTime || !endTime) return false;
    return endTime < startTime;
  }, [startTime, endTime]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>قوالب الورديات</CardTitle>
          <CardDescription>
            الوردية العابرة لمنتصف الليل تُنسب إلى يوم بدايتها
          </CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                وردية جديدة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إنشاء وردية</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shift-code">الرمز</Label>
                    <Input
                      id="shift-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="MORNING"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shift-name-ar">الاسم العربي</Label>
                    <Input
                      id="shift-name-ar"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      placeholder="صباحية"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift-name-en">الاسم الإنجليزي</Label>
                  <Input
                    id="shift-name-en"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Morning"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shift-start">وقت البداية</Label>
                    <Input
                      id="shift-start"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shift-end">وقت النهاية</Label>
                    <Input
                      id="shift-end"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                {crossesMidnightPreview && (
                  <p className="flex items-center gap-1.5 text-sm text-indigo-600">
                    <MoonStar className="h-4 w-4" />
                    وردية عابرة لمنتصف الليل — ستُنسب ليوم بدايتها
                  </p>
                )}
                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      code,
                      nameAr,
                      nameEn,
                      startTime,
                      endTime,
                    })
                  }
                  disabled={
                    createMutation.isPending ||
                    !code ||
                    !nameAr ||
                    !nameEn ||
                    !startTime ||
                    !endTime
                  }
                  className="gap-2"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  إنشاء الوردية
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingRow />
        ) : !templates?.length ? (
          <EmptyState text="لا توجد ورديات بعد — أنشئ أول وردية للبدء" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الرمز</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الوقت</TableHead>
                <TableHead className="text-right">المدة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                {canCreate && (
                  <TableHead className="text-right">إجراءات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className={t.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-mono font-medium">
                    {t.code}
                  </TableCell>
                  <TableCell>{t.nameAr}</TableCell>
                  <TableCell dir="ltr" className="text-right">
                    {fmtTime(t.startTime)} - {fmtTime(t.endTime)}
                    {t.crossesMidnight && (
                      <MoonStar className="mr-1.5 inline h-3.5 w-3.5 text-indigo-500" />
                    )}
                  </TableCell>
                  <TableCell>{minutesToHours(t.durationMinutes)}</TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? "default" : "outline"}>
                      {t.isActive ? "نشطة" : "معطلة"}
                    </Badge>
                  </TableCell>
                  {canCreate && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({
                            templateId: t.id,
                            isActive: !t.isActive,
                          })
                        }
                      >
                        {t.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// التكليفات
// ===========================================================================

function AssignmentsTab({ canCreate }: { canCreate: boolean }) {
  const utils = trpc.useUtils();
  const { data: periods } = trpc.schedules.listPeriods.useQuery({});
  const assignablePeriods = useMemo(
    () =>
      (periods ?? []).filter((p) => ["draft", "published"].includes(p.status)),
    [periods],
  );

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const periodId = selectedPeriodId ? Number(selectedPeriodId) : undefined;

  const { data: assignments, isLoading } =
    trpc.schedules.listAssignments.useQuery(
      { periodId },
      { enabled: !!periodId },
    );
  const { data: templates } = trpc.schedules.listShiftTemplates.useQuery({
    activeOnly: true,
  });
  const { data: workersList } = trpc.workers.listAll.useQuery(undefined, {
    retry: false,
  });

  const [open, setOpen] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [formError, setFormError] = useState("");

  const invalidate = () => utils.schedules.listAssignments.invalidate();

  const createMutation = trpc.schedules.createAssignment.useMutation({
    onSuccess: () => {
      setOpen(false);
      setWorkerId("");
      setTemplateId("");
      setWorkDate("");
      setFormError("");
      invalidate();
    },
    onError: (e) => setFormError(e.message),
  });
  const confirmMutation = trpc.schedules.confirmAssignment.useMutation({
    onSuccess: invalidate,
  });
  const cancelMutation = trpc.schedules.cancelAssignment.useMutation({
    onSuccess: invalidate,
  });

  const workerName = (id: number) => {
    const w = (workersList as any[])?.find((w) => w.id === id);
    return w ? `${w.nameAr} (${w.employeeId})` : `#${id}`;
  };
  const templateName = (id: number) => {
    const t = templates?.find((t) => t.id === id);
    return t ? t.nameAr : `#${id}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>التكليفات</CardTitle>
          <CardDescription>
            اختر فترة لعرض تكليفاتها — يمنع النظام التعارض الزمني وتجاوز الحد
            اليومي تلقائيًا
          </CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!periodId}>
                <Plus className="h-4 w-4" />
                تكليف جديد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إنشاء تكليف</DialogTitle>
                <DialogDescription>
                  يفحص النظام: الإجازات، التعارض الزمني (يشمل الورديات الليلية)،
                  والحد اليومي
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>العامل</Label>
                  <Select value={workerId} onValueChange={setWorkerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر العامل" />
                    </SelectTrigger>
                    <SelectContent>
                      {(workersList as any[])?.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.nameAr} ({w.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الوردية</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الوردية" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.nameAr} ({fmtTime(t.startTime)} -{" "}
                          {fmtTime(t.endTime)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assign-date">تاريخ العمل</Label>
                  <Input
                    id="assign-date"
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                  />
                </div>
                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      periodId: periodId!,
                      workerId: Number(workerId),
                      shiftTemplateId: Number(templateId),
                      workDate,
                    })
                  }
                  disabled={
                    createMutation.isPending ||
                    !periodId ||
                    !workerId ||
                    !templateId ||
                    !workDate
                  }
                  className="gap-2"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  إنشاء التكليف
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm">
          <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر فترة الجدول" />
            </SelectTrigger>
            <SelectContent>
              {assignablePeriods.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} ({fmtDate(p.startDate)} - {fmtDate(p.endDate)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!periodId ? (
          <EmptyState text="اختر فترة من القائمة أعلاه لعرض تكليفاتها" />
        ) : isLoading ? (
          <LoadingRow />
        ) : !assignments?.length ? (
          <EmptyState text="لا توجد تكليفات في هذه الفترة — أنشئ أول تكليف" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العامل</TableHead>
                <TableHead className="text-right">الوردية</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الوقت</TableHead>
                <TableHead className="text-right">الساعات</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                {canCreate && (
                  <TableHead className="text-right">إجراءات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => {
                const status = ASSIGNMENT_STATUS_LABELS[a.status] ?? {
                  label: a.status,
                  variant: "outline" as const,
                };
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {workerName(a.workerId)}
                    </TableCell>
                    <TableCell>{templateName(a.shiftTemplateId)}</TableCell>
                    <TableCell>{fmtDate(a.workDate)}</TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {fmtTime(a.startTime)} - {fmtTime(a.endTime)}
                      {a.crossesMidnight && (
                        <MoonStar className="mr-1.5 inline h-3.5 w-3.5 text-indigo-500" />
                      )}
                    </TableCell>
                    <TableCell>{minutesToHours(a.plannedMinutes)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    {canCreate && (
                      <TableCell>
                        <div className="flex gap-2">
                          {a.status === "planned" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={confirmMutation.isPending}
                              onClick={() =>
                                confirmMutation.mutate({ assignmentId: a.id })
                              }
                            >
                              تأكيد
                            </Button>
                          )}
                          {["planned", "confirmed"].includes(a.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={cancelMutation.isPending}
                              onClick={() => {
                                const reason = window.prompt("سبب الإلغاء:");
                                if (reason?.trim())
                                  cancelMutation.mutate({
                                    assignmentId: a.id,
                                    reason: reason.trim(),
                                  });
                              }}
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// مشتركات
// ===========================================================================

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      جارٍ التحميل...
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
