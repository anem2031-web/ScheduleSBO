import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import {
  activeSupervisorLink,
  addCalendarDays,
  assertOperationalInterval,
  riyadhToday,
  sundayOf,
  WEEK_DAY_NAMES,
  type DirectInterval,
} from "@shared/weekly-schedule";
import { buildWeeklyRosterHtml, exportWeeklyPng } from "./weekly-export";
import { formatNumber, normalizeDigits } from "@shared/display-format";
import { permits } from "@shared/access-control";
import { workerRestLabel, rosterCellKey, type RosterDraft } from "./weekly-board-model";
import { useRosterModel } from "./useRosterModel";
import { WeeklyRosterRow } from "./WeeklyRosterRow";
import { useVirtualRoster } from "./useVirtualRoster";
import { PeriodDestinationEditor } from "./PeriodDestinationEditor";
import { useLanguage } from "@/lib/i18n";
import { directPeriod, EMPTY_DESTINATIONS } from "./period-destination";
import { invalidWhatsAppPreview } from "./whatsapp-preview-gating";
export type { BoardWorker, BoardAssignment } from "./weekly-board-model";
import type { BoardWorker, BoardAssignment } from "./weekly-board-model";

type Draft = RosterDraft;
const cellKey = rosterCellKey;
const PAGE_SIZE = 32;
const EMPTY_ASSIGNMENTS: BoardAssignment[] = [];

export function WeeklyBoard() {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const weekday = (index: number) => language === "ar" ? WEEK_DAY_NAMES[index] : language === "en"
    ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]
    : ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"][index];
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [weekStart, setWeekStart] = useState(() => sundayOf(riyadhToday()));
  const [center, setCenter] = useState("");
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [offset, setOffset] = useState(0);
  const filtersSettled = normalizeDigits(search).trim() === querySearch;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuerySearch(normalizeDigits(search).trim());
      setOffset(0);
      setSelectedWorkers([]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const [supervisorId, setSupervisorId] = useState<number | undefined>(
    user?.role === "supervisor" ? user.id : undefined,
  );
  const ownerId = user?.role === "supervisor" ? user.id : supervisorId;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [editor, setEditor] = useState<{
    workerId: number;
    date: string;
    intervals: DirectInterval[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printPreview, setPrintPreview] = useState<{
    center: string;
    html: string;
  } | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
  const [showWhatsAppReviews, setShowWhatsAppReviews] = useState(false);
  const [whatsAppFormat, setWhatsAppFormat] = useState<"text" | "image" | "media">("media");
  const [forceWeekly, setForceWeekly] = useState(false);
  const printFrame = useRef<HTMLIFrameElement>(null);
  const {
    data,
    isLoading,
    error: queryError,
    refetch: refreshBoard,
  } = trpc.schedules.getWeeklyBoardPage.useQuery({
    weekStart, center: center || undefined, search: querySearch || undefined,
    offset, limit: PAGE_SIZE,
  });
  const canEdit =
    permits(user?.permissions ?? [], "schedule:update") ||
    permits(user?.permissions ?? [], "schedule:create");
  const canApprove = permits(user?.permissions ?? [], "schedule:approve");
  const canSendWholeWhatsAppTrial = canApprove && user?.role !== "supervisor" && user?.role !== "worker" && (user?.role === "admin" || user?.accessScope == null);
  const whatsappTrial = trpc.schedules.getWhatsAppTrialStatus.useQuery(undefined, { enabled: canApprove });
  const sendWhatsAppProbe = trpc.schedules.sendWhatsAppTrialProbe.useMutation({
    onSuccess: (result) => { setError(""); setMessage(result.message); },
    onError: (err) => setError(err.message),
  });
  const sendPublishedWhatsAppTrial = trpc.schedules.sendPublishedWhatsAppTrial.useMutation({
    onSuccess: (result) => {
      setError("");
      setForceWeekly(false);
      setMessage(result.mode === "test"
        ? `واتساب التجريبي: قبلت Meta ${result.sent} طلب إرسال، وفشل ${result.failed}. ${result.note}`
        : result.note);
    },
    onError: (err) => { setForceWeekly(false); setError(err.message); },
  });
  const canExport = permits(user?.permissions ?? [], "schedule:export");
  const period = data?.periods.find(
    (p) => p.startDate && p.status !== "cancelled",
  );
  const whatsAppPreview = trpc.schedules.getPublishedWhatsAppTrialPreview.useQuery(
    { periodId: period?.id ?? 0, format: whatsAppFormat },
    { enabled: period?.status === "published" && canSendWholeWhatsAppTrial && !!whatsappTrial.data?.ready && !whatsappTrial.data.connectionTest },
  );
  const previewInvalid = invalidWhatsAppPreview(whatsAppPreview);
  const whatsAppReviews = trpc.schedules.getWhatsAppTrialReviews.useQuery(
    { periodId: period?.id ?? 0 },
    { enabled: showWhatsAppReviews && !!period?.id && user?.role === "admin" },
  );
  const resolveWhatsAppReview = trpc.schedules.resolveWhatsAppTrialReview.useMutation({
    onSuccess: () => { setMessage("تم تسجيل مراجعة إرسال واتساب."); setError(""); whatsAppReviews.refetch(); },
    onError: (err) => setError(err.message),
  });
  const approve = trpc.schedules.publishPeriod.useMutation({
    onSuccess: (result) => {
      const trial = result.whatsappTrial;
      setMessage(`تم اعتماد ونشر الجدول الأسبوعي. ${trial.mode === "test" ? `واتساب التجريبي: ${trial.eligible} رقم مطابق لقائمة التجربة، قبلت Meta ${trial.sent} طلب إرسال، وفشل ${trial.failed}. ${trial.note}` : trial.note}`);
      utils.schedules.getWeeklyBoard.invalidate();
      utils.schedules.getWeeklyBoardPage.invalidate();
      utils.schedules.getWeeklyBoardExport.invalidate();
      utils.schedules.listPeriods.invalidate();
      utils.schedules.getPublishedWhatsAppTrialPreview.invalidate();
    },
    onError: (err) => setError(err.message),
  });
  const weekLocked =
    data?.periods.some((period) =>
      ["locked", "archived"].includes(period.status),
    ) ?? false;
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)),
    [weekStart],
  );
  const centers = data?.centers ?? [];
  const supervisors = data?.supervisors.filter((item) => item.isActive !== false) ?? [];
  const visibleWorkers = useMemo(() => data?.workers ?? [], [data?.workers]);
  const destinations = data?.destinations ?? EMPTY_DESTINATIONS;
  const editingWorker = visibleWorkers.find((worker) => worker.id === editor?.workerId);
  const model = useRosterModel(visibleWorkers, data?.assignments ?? EMPTY_ASSIGNMENTS, dates, drafts, ownerId);
  const rowIds = useMemo(() => visibleWorkers.map((worker) => worker.id), [visibleWorkers]);
  const virtual = useVirtualRoster({ rowIds, resetKey: `${weekStart}/${center}/${querySearch}/${offset}` });
  const save = trpc.schedules.saveWeeklyCells.useMutation({
    onSuccess: async (report) => {
      setError("");
      setMessage(
        `حُفظ ${report.savedCells} يوم عمل. أُرسل إشعار إلى ${report.notifiedSupervisors} من المشرفين المرتبطين.`,
      );
      utils.schedules.getWeeklyBoard.invalidate();
      utils.schedules.getWeeklyBoardPage.invalidate(undefined, { refetchType: "none" });
      utils.schedules.getWeeklyBoardExport.invalidate();
      utils.schedules.listPeriods.invalidate();
      utils.schedules.listAssignments.invalidate();
      utils.schedules.getWorkerTimeline.invalidate();
      utils.schedules.getPublishedWhatsAppTrialPreview.invalidate();
      try {
        await refreshBoard({ throwOnError: true });
        setDrafts({});
      } catch {
        setError("حُفظت التعديلات، لكن تعذر تحديث العرض. التعديلات باقية أمامك؛ أعد تحميل الصفحة عند عودة الاتصال.");
      }
    },
    onError: (err) => setError(err.message),
  });
  const changeWeek = (value: string) => {
    if (
      Object.keys(drafts).length &&
      !window.confirm(
        "توجد تعديلات لم تحفظ. هل تريد تركها والانتقال إلى أسبوع آخر؟",
      )
    )
      return;
    setWeekStart(sundayOf(value));
    setOffset(0);
    setDrafts({});
    setSelectedWorkers([]);
    setSelectedDates([]);
    setMessage("");
    setError("");
    setShowWhatsAppPreview(false);
    setForceWeekly(false);
  };
  const changeOwner = (value: string) => {
    if (
      Object.keys(drafts).length &&
      !window.confirm("توجد تعديلات لم تحفظ. هل تريد تركها وتغيير المشرف؟")
    )
      return;
    setSupervisorId(value ? Number(value) : undefined);
    setDrafts({});
    setError("");
    setMessage("");
  };
  const editable = (worker: BoardWorker, date: string) =>
    canEdit &&
    filtersSettled &&
    !copying &&
    !!ownerId &&
    worker.supervisors.some(
      (s) => s.id === ownerId && activeSupervisorLink(s, date),
    );
  const restLabel = workerRestLabel;
  const selectWorker = useCallback((workerId: number, checked: boolean) => {
    setSelectedWorkers((current) => checked ? [...current, workerId] : current.filter((id) => id !== workerId));
  }, []);
  const editCell = useCallback((workerId: number, date: string, intervals: readonly DirectInterval[]) => {
    setError("");
    setEditor({ workerId, date, intervals: intervals.map((interval) => ({ ...interval })) });
  }, []);
  const stageEditor = (bulk: boolean) => {
    if (!editor || !data) return;
    try {
      editor.intervals.forEach(assertOperationalInterval);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const workerIds = bulk ? selectedWorkers : [editor.workerId],
      targetDates = bulk ? selectedDates : [editor.date];
    if (!workerIds.length || !targetDates.length) {
      setError("اختر العمال والأيام في الجدول أولًا");
      return;
    }
    const changes: Record<string, Draft> = {};
    let skipped = 0;
    for (const workerId of workerIds)
      for (const date of targetDates) {
        const worker = data.workers.find((w) => w.id === workerId);
        if (
          !worker ||
          !editable(worker, date) ||
          (editor.intervals.length && restLabel(worker, date))
        ) {
          skipped++;
          continue;
        }
        changes[cellKey(workerId, date)] = {
          workerId,
          workDate: date,
          intervals: editor.intervals.map((interval) => ({ ...interval })),
        };
      }
    setDrafts((current) => ({ ...current, ...changes }));
    setEditor(null);
    setError("");
    setMessage(
      `أُضيفت التعديلات إلى ${Object.keys(changes).length} يوم عمل. ${skipped ? `تُرك ${skipped} يوم راحة أو يوم خارج ارتباط المشرف.` : ""} اضغط حفظ الأسبوع لحفظ المسودة، ثم اطلب اعتمادها.`,
    );
  };
  const copyLastWeek = async () => {
    if (!ownerId) {
      setError("اختر المشرف أولًا");
      return;
    }
    setCopying(true);
    setError("");
    try {
      const previous = await utils.schedules.getWeeklyBoardPage.fetch({
        weekStart: addCalendarDays(weekStart, -7),
        workerIds: visibleWorkers.map((worker) => worker.id),
        limit: PAGE_SIZE,
      });
      const changes: Record<string, Draft> = {};
      for (const worker of visibleWorkers)
        for (const date of dates) {
          if (!editable(worker, date) || restLabel(worker, date)) continue;
          const source = previous.assignments.filter(
            (a) =>
              a.workerId === worker.id &&
              a.workDate === addCalendarDays(date, -7) &&
              a.supervisorId === ownerId,
          );
          if (source.length)
            changes[cellKey(worker.id, date)] = {
              workerId: worker.id,
              workDate: date,
              intervals: source.map(directPeriod),
            };
        }
      setDrafts((current) => ({ ...current, ...changes }));
      setMessage(
        Object.keys(changes).length
          ? `نُسخت فترات المشرف إلى ${Object.keys(changes).length} يوم عمل لعمال هذه الصفحة. راجعها ثم احفظ الأسبوع.`
          : "لا توجد فترات قابلة للنسخ لهذا المشرف من الأسبوع السابق.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCopying(false);
    }
  };
  const exportRoster = async (image: boolean) => {
    if (!canExport) {
      setError("ليس لديك صلاحية تصدير الجداول");
      return;
    }
    if (!center) {
      setError("اختر مركز تكلفة واحدًا لتصدير جدوله بصورة مستقلة");
      return;
    }
    if (center === "مركز غير محدد") {
      setError("حدد مركز التكلفة في بطاقات هؤلاء العمال قبل التصدير");
      return;
    }
    if (Object.keys(drafts).length) {
      setError("احفظ التعديلات أو تراجع عنها قبل تصدير الجدول الرسمي");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const fullCenter = await utils.schedules.getWeeklyBoardExport.fetch({ weekStart, center });
      const payload = { language, center, weekStart, dates, workers: fullCenter.workers, assignments: fullCenter.assignments };
      if (image) {
        const parts = await exportWeeklyPng(payload);
        setMessage(parts > 1 ? `تم تصدير جدول المركز على ${formatNumber(parts)} صور مرقمة.` : "تم تصدير صورة جدول المركز.");
      }
      else {
        setPrintReady(false);
        setPrintPreview({ center, html: buildWeeklyRosterHtml(payload) });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5" dir={language === "en" ? "ltr" : "rtl"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{text("الجدول الأسبوعي", "Weekly schedule", "ہفتہ وار شیڈول")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text("رتّب فترات العمل من الأحد إلى السبت، وراجع رصيد العامل بين جميع مشرفيه.", "Arrange shifts from Sunday to Saturday and review each worker’s hours across supervisors.", "اتوار سے ہفتہ تک شفٹیں ترتیب دیں اور تمام سپروائزرز میں کارکن کے اوقات دیکھیں۔")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportRoster(false)}
            disabled={!data || !canExport || exporting}
          >
            <Printer className="h-4 w-4" /> {text("طباعة / PDF", "Print / PDF", "پرنٹ / PDF")}
          </Button>
          <Button
            variant="outline"
            onClick={() => exportRoster(true)}
            disabled={!data || !canExport || exporting}
          >
            <Download className="h-4 w-4" /> {text("صورة", "Image", "تصویر")}
          </Button>
          {exporting && <span role="status" className="self-center text-sm">{text("جارٍ تجهيز جدول المركز كاملًا…", "Preparing the full cost center schedule…", "مکمل لاگت مرکز کا شیڈول تیار کیا جا رہا ہے…")}</span>}
        </div>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <div className="space-y-2">
            <Label htmlFor="roster-week">{text("أي يوم من الأسبوع المطلوب", "Any day in the required week", "مطلوبہ ہفتے کا کوئی بھی دن")}</Label>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label={text("الأسبوع السابق", "Previous week", "پچھلا ہفتہ")}
                disabled={save.isPending || copying}
                onClick={() => changeWeek(addCalendarDays(weekStart, -7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Input
                id="roster-week"
                type="date"
                value={weekStart}
                disabled={save.isPending || copying}
                onChange={(e) => e.target.value && changeWeek(e.target.value)}
              />
              <Button
                size="icon"
                variant="outline"
                aria-label={text("الأسبوع التالي", "Next week", "اگلا ہفتہ")}
                disabled={save.isPending || copying}
                onClick={() => changeWeek(addCalendarDays(weekStart, 7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="roster-center">{text("مركز التكلفة", "Cost center", "لاگت مرکز")}</Label>
            <select
              id="roster-center"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={center}
              disabled={Object.keys(drafts).length > 0 || save.isPending || copying}
              onChange={(e) => {
                setCenter(e.target.value);
                setOffset(0);
                setSelectedWorkers([]);
                setSelectedDates([]);
              }}
            >
              <option value="">{text("جميع المراكز", "All cost centers", "تمام لاگت مراکز")}</option>
              {centers.map((name) => (
                <option key={name} value={name}>
                  {normalizeDigits(name)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48 space-y-2">
            <Label htmlFor="roster-search">{text("البحث عن عامل", "Search for a worker", "کارکن تلاش کریں")}</Label>
            <Input
              id="roster-search"
              value={search}
              disabled={Object.keys(drafts).length > 0 || save.isPending || copying}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={text("الاسم أو الرقم أو القسم", "Name, number or department", "نام، نمبر یا شعبہ")}
            />
          </div>
          {canEdit && user?.role !== "supervisor" && (
            <div className="space-y-2">
              <Label htmlFor="roster-supervisor">
                {text("المشرف المسؤول عن الفترات", "Supervisor responsible for shifts", "شفٹوں کا ذمہ دار سپروائزر")}
              </Label>
              <select
                id="roster-supervisor"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={supervisorId ?? ""}
                onChange={(e) => changeOwner(e.target.value)}
                disabled={save.isPending || copying}
              >
                <option value="">{text("اختر المشرف للتعديل", "Select a supervisor to edit", "ترمیم کے لیے سپروائزر منتخب کریں")}</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {normalizeDigits(s.name ?? `مشرف ${s.id}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>
      {error || queryError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {normalizeDigits(error || queryError?.message || "")}
        </div>
      ) : null}
      {message && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
        >
          {message}
        </div>
      )}
      {weekLocked && (
        <div role="status" className="rounded-lg border bg-muted p-3 text-sm">
          {text("هذا الأسبوع مقفل أو مؤرشف. يمكنك مراجعته وتصديره؛ إعادة فتحه من صلاحية الإدارة.", "This week is locked or archived. You can review and export it; only administration may reopen it.", "یہ ہفتہ مقفل یا محفوظ ہے۔ آپ اسے دیکھ اور برآمد کر سکتے ہیں؛ دوبارہ کھولنا انتظامیہ کا اختیار ہے۔")}
        </div>
      )}
      {canApprove && whatsappTrial.data && (
        <div role="status" className="rounded-lg border bg-muted p-3 text-sm">
          واتساب التجريبي: {whatsappTrial.data.ready ? `الربط جاهز حتى ${whatsappTrial.data.recipients} مستلمين محددين` : "غير مفعّل على الخادم"}.
          {whatsappTrial.data.ready && !whatsappTrial.data.autoSend && " الإرسال عند اعتماد الأسبوع متوقف؛ يمكن الإرسال يدويًا بعد المراجعة."}
          {whatsappTrial.data.ready && !whatsappTrial.data.connectionTest && !whatsappTrial.data.updateTemplateApproved && !whatsappTrial.data.enTemplatesApproved && " إرسال التعديلات ينتظر اعتماد قالب التعديل وضبطه."}
          {whatsappTrial.data.ready && (whatsappTrial.data.connectionTest
            ? " وضع اختبار الاتصال مفعّل، وتحتوي رسالة الاختبار على نص Meta التجريبي دون تفاصيل الجداول."
            : !whatsappTrial.data.scheduleTemplateApproved && !whatsappTrial.data.enTemplatesApproved && " إرسال الجدول ينتظر اعتماد قالب Meta. يمكنك إعداد الأسبوع واعتماده الآن.")}
          {!whatsappTrial.data.connectionTest && canSendWholeWhatsAppTrial && <div className="mt-3 max-w-sm space-y-1">
            <Label htmlFor="whatsapp-pilot-format">شكل رسالة التجربة اليدوية بالإنجليزية</Label>
            <select id="whatsapp-pilot-format" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={whatsAppFormat} onChange={(event) => setWhatsAppFormat(event.target.value as typeof whatsAppFormat)}>
              <option value="media">صورة مع تفاصيل الجدول نصيًا</option>
              <option value="image">صورة مع رسالة قصيرة</option>
              <option value="text">تفاصيل الجدول نصيًا</option>
            </select>
            <p className="text-xs text-muted-foreground">يُطبق الاختيار على المعاينة والإرسال اليدوي للعمال ذوي لغة التواصل الإنجليزية؛ العربية تُرسل نصيًا. الإرسال التلقائي عند الاعتماد يستخدم التنسيق الافتراضي للخادم.</p>
            {period?.status === "published" && <label className="flex items-start gap-2 pt-2 text-sm">
              <input type="checkbox" checked={forceWeekly} onChange={(event) => setForceWeekly(event.target.checked)} className="mt-1" />
              <span>إعادة إرسال الجدول الأسبوعي للعمال المحددين حتى لو أُرسل سابقًا <span className="text-muted-foreground">(قد تصلهم نسخة مكررة)</span></span>
            </label>}
          </div>}
          {period?.status === "published" && canSendWholeWhatsAppTrial && whatsappTrial.data.ready && !whatsappTrial.data.connectionTest && previewInvalid && <p className="mt-2 text-xs text-muted-foreground" role="status">
            {whatsAppPreview.isLoading || whatsAppPreview.isFetching ? "جارٍ التحقق من رسائل التجربة…" : "لا يمكن الإرسال حتى تكون معاينة جميع رسائل التجربة جاهزة وخالية من الأخطاء."}
          </p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {whatsappTrial.data.ready && whatsappTrial.data.targets.map((target) => <Button key={target.index} size="sm" variant="outline" disabled={sendWhatsAppProbe.isPending} onClick={() => sendWhatsAppProbe.mutate({ recipientIndex: target.index })}>
              إرسال تجربة إلى الرقم المنتهي بـ{target.ending}
            </Button>)}
            {period?.status === "published" && canSendWholeWhatsAppTrial && <Button size="sm" variant="outline" onClick={() => setShowWhatsAppPreview(true)}>
              معاينة رسائل عمال التجربة
            </Button>}
            {period && user?.role === "admin" && <Button size="sm" variant="outline" onClick={() => setShowWhatsAppReviews(true)}>مراجعة إرسال واتساب</Button>}
            {period?.status === "published" && canSendWholeWhatsAppTrial && <Button size="sm"
              disabled={!whatsappTrial.data.ready || (!whatsappTrial.data.connectionTest && previewInvalid) || sendPublishedWhatsAppTrial.isPending}
              onClick={() => {
                if (window.confirm(whatsappTrial.data.connectionTest
                  ? "إرسال رسالة Meta التجريبية لاختبار الاتصال إلى عمال التجربة المسموح بهم؟ الرسالة لا تحتوي على تفاصيل جدولهم. إذا أرسلتها سابقًا فقد تصلهم نسخة أخرى."
                  : forceWeekly
                    ? "ستُرسل نسخة كاملة من الجدول المعتمد إلى عمال التجربة المحددين حتى لو وصلتهم سابقًا. هل تريد المتابعة؟"
                    : "إرسال الجدول أو التغييرات المعتمدة إلى عمال التجربة؟ لن تُعاد الرسائل المسجلة سابقًا دون تغيير."))
                  sendPublishedWhatsAppTrial.mutate({ periodId: period.id, format: whatsAppFormat, forceWeekly });
              }}>
              {whatsappTrial.data.connectionTest
                ? sendPublishedWhatsAppTrial.isPending ? "جارٍ إرسال اختبار الاتصال…" : "إرسال اختبار الاتصال لعمال التجربة"
                : sendPublishedWhatsAppTrial.isPending ? "جارٍ إرسال جدول التجربة…" : "إرسال جدول التجربة المعتمد"}
            </Button>}
          </div>
        </div>
      )}
      <Dialog open={showWhatsAppPreview} onOpenChange={setShowWhatsAppPreview}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>معاينة بيانات جدول التجربة</DialogTitle>
            <DialogDescription>هذه معاينة لبيانات الأسبوع المعتمد كاملًا، ولا ترسل رسائل. تظهر صورة الجدول عند توفرها. إذا أُرسل الجدول سابقًا، فالإرسال العادي يرسل الأيام التي تغيرت فقط. لإرسال الأسبوع كاملًا مرة أخرى اختر إعادة إرسال الجدول قبل الإرسال.</DialogDescription>
          </DialogHeader>
          {whatsAppPreview.isLoading ? <p role="status">جارٍ تجهيز الرسائل…</p> : whatsAppPreview.error ? <p role="alert">{whatsAppPreview.error.message}</p> : <>
            {!whatsAppPreview.data?.messages.length && <p>لا يوجد عامل في الأسبوع المعتمد برقم مطابق لقائمة التجربة. راجع أرقام العمال وإعدادات التجربة.</p>}
            {whatsAppPreview.data?.messages.map((entry) => <section key={entry.workerId} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{entry.name} · الرقم المنتهي بـ{entry.phoneEnding}</h3>
              <p className="text-xs text-muted-foreground">
                {entry.language ? `لغة الرسالة: ${entry.language === "ar" ? "العربية" : "الإنجليزية"}` : "لغة الرسالة غير مدعومة"}
                {entry.deliveryFormat && ` · التنسيق: ${{ text: "نص", image: "صورة مع رسالة قصيرة", media: "صورة مع تفاصيل نصية" }[entry.deliveryFormat]}`}
              </p>
              {entry.configurationError && <p role="alert" className="text-destructive">{entry.configurationError}</p>}
              {entry.imagePreview?.startsWith("data:image/png;base64,") && <img
                src={entry.imagePreview}
                alt={`معاينة صورة جدول ${entry.name}`}
                className="mx-auto max-h-[32rem] max-w-full rounded border object-contain"
                loading="lazy"
              />}
              {entry.error ? <p role="alert" className="text-destructive">{entry.error}</p> : <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="p-2 text-right">اليوم</th><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الدوام أو الإجازة</th></tr></thead>
                <tbody>{WEEK_DAY_NAMES.map((name, index) => <tr key={name} className="border-b last:border-0"><td className="p-2">{name}</td><td className="p-2"><span dir="ltr">{entry.values?.[index * 3]}</span></td><td className="p-2"><div>{entry.values?.[index * 3 + 1]}</div><div>{entry.values?.[index * 3 + 2]}</div></td></tr>)}</tbody>
              </table>}
            </section>)}
          </>}
          <DialogFooter><Button variant="outline" onClick={() => setShowWhatsAppPreview(false)}>إغلاق المعاينة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showWhatsAppReviews} onOpenChange={setShowWhatsAppReviews}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>مراجعة إرسال واتساب</DialogTitle>
            <DialogDescription>تحقق من هاتف العامل أولًا. لا تعِد المحاولة إذا لم تتأكد من وصول الرسالة أو عدم وصولها.</DialogDescription></DialogHeader>
          {whatsAppReviews.isLoading ? <p>جارٍ تحميل الحالات…</p> : whatsAppReviews.error ? <p role="alert">تعذرت قراءة الحالات. تحقق من تهيئة جدول واتساب في قاعدة البيانات.</p> : <>
            {!whatsAppReviews.data?.length && <p>لا توجد حالات تنتظر المراجعة لهذا الأسبوع.</p>}
            {whatsAppReviews.data?.map((item) => <section key={item.workerId} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{item.name} · {item.state === "sending" ? "قيد المعالجة" : "تحتاج مراجعة"}</h3>
              <p className="text-sm">الحالة المعلقة للجدول: {item.pendingSnapshot ? "تم تجهيز رسالة قبل انقطاع التأكيد" : "لم تُجهّز بيانات رسالة"}.</p>
              {item.pendingSnapshot && <div className="max-h-44 overflow-auto rounded border p-2 text-sm">{WEEK_DAY_NAMES.map((day, i) => {
                const old = item.snapshot?.slice(i * 3, i * 3 + 3);
                const next = item.pendingSnapshot?.slice(i * 3, i * 3 + 3);
                return next && (!old || JSON.stringify(old) !== JSON.stringify(next)) ? <div key={day} className="border-b py-1">{day} · <span dir="ltr">{next[0]}</span> · {next[1]} · {next[2]}</div> : null;
              })}</div>}
              <div className="flex flex-wrap gap-2">{[true, false].map((delivered) => <Button key={String(delivered)} size="sm" variant="outline" disabled={resolveWhatsAppReview.isPending || (delivered && !item.pendingSnapshot)} onClick={() => {
                const reason = window.prompt(delivered ? "بعد التأكد من وصول الرسالة إلى العامل، اكتب سبب اعتماد المراجعة:" : "بعد التأكد أن الرسالة لم تصل، اكتب سبب فتح إعادة المحاولة:");
                if (!reason) return;
                if (reason.trim().length < 8) { setError("اكتب سببًا لا يقل عن 8 أحرف."); return; }
                if (period && window.confirm(delivered ? "تأكيد تسجيل الرسالة على أنها وصلت للعامل؟" : "تأكيد عدم وصول الرسالة وفتح إمكانية إعادة إرسالها؟"))
                  resolveWhatsAppReview.mutate({ periodId: period.id, workerId: item.workerId, delivered, reason });
              }}>{delivered ? "تأكدت من وصولها" : "تأكدت أنها لم تصل"}</Button>)}</div>
            </section>)}
          </>}
          <DialogFooter><Button variant="outline" onClick={() => setShowWhatsAppReviews(false)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {isLoading ? (
        <div className="flex justify-center gap-2 py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          {text("جارٍ تحميل الأسبوع…", "Loading the week…", "ہفتہ لوڈ ہو رہا ہے…")}
        </div>
      ) : !data ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {text("من", "From", "از")} <b dir="ltr">{weekStart}</b> {text("إلى", "to", "تا")}{" "}
              <b dir="ltr">{data.weekEnd}</b> · {formatNumber(data.totalWorkers)} {text("عامل", "workers", "کارکن")} ·{" "}
              <span className="text-blue-700 dark:text-blue-300">
                {text("الأزرق: فترات المشرف المختار", "Blue: selected supervisor’s shifts", "نیلا: منتخب سپروائزر کی شفٹیں")}
              </span>{" "}
              ·{" "}
              <span className="text-violet-700 dark:text-violet-300">
                {text("البنفسجي: فترات المشرفين الآخرين", "Purple: other supervisors’ shifts", "جامنی: دوسرے سپروائزرز کی شفٹیں")}
              </span>
            </p>
            {canApprove && period?.status === "draft" && (
              <Button
                disabled={approve.isPending || Object.keys(drafts).length > 0}
                onClick={() => approve.mutate({ periodId: period.id })}
              >
                {text("اعتماد ونشر الأسبوع", "Approve and publish week", "ہفتہ منظور اور شائع کریں")}
              </Button>
            )}
            <span className="text-sm">
              {period?.status === "published"
                ? text("معتمد ومنشور", "Approved and published", "منظور اور شائع")
                : text("مسودة — يحتاج اعتمادًا", "Draft — approval needed", "مسودہ — منظوری درکار")}
            </span>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={copyLastWeek}
                  disabled={!ownerId || copying || save.isPending || weekLocked || !visibleWorkers.length || !filtersSettled}
                >
                  <Copy className="h-4 w-4" />
                  {copying ? text("جارٍ النسخ…", "Copying…", "نقل ہو رہا ہے…") : text("نسخ فتراتي لعمال الصفحة من الأسبوع السابق", "Copy my shifts from last week for this page", "اس صفحے کے کارکنوں کے لیے پچھلے ہفتے کی میری شفٹیں نقل کریں")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!Object.keys(drafts).length || save.isPending}
                  onClick={() => {
                    setDrafts({});
                    setMessage("");
                    setError("");
                  }}
                >
                  {text("تراجع عن التعديلات", "Discard changes", "تبدیلیاں واپس لیں")}
                </Button>
                <Button
                  disabled={
                    !Object.keys(drafts).length ||
                    save.isPending ||
                    !ownerId ||
                    weekLocked
                  }
                  onClick={() =>
                    save.mutate({
                      weekStart,
                      supervisorId: ownerId,
                      changes: Object.values(drafts),
                    })
                  }
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {text("حفظ الأسبوع", "Save week", "ہفتہ محفوظ کریں")}{" "}
                  {Object.keys(drafts).length
                    ? `(${Object.keys(drafts).length})`
                    : ""}
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={text("صفحات العمال", "Worker pages", "کارکنوں کے صفحات")}>
            <span role="status">{text(`عرض ${formatNumber(data.totalWorkers ? offset + 1 : 0)}–${formatNumber(offset + visibleWorkers.length)} من ${formatNumber(data.totalWorkers)} عامل · الصفحة ${formatNumber(Math.floor(offset / PAGE_SIZE) + 1)} من ${formatNumber(Math.max(1, Math.ceil(data.totalWorkers / PAGE_SIZE)))}`, `Showing ${formatNumber(data.totalWorkers ? offset + 1 : 0)}–${formatNumber(offset + visibleWorkers.length)} of ${formatNumber(data.totalWorkers)} workers · Page ${formatNumber(Math.floor(offset / PAGE_SIZE) + 1)} of ${formatNumber(Math.max(1, Math.ceil(data.totalWorkers / PAGE_SIZE)))}`, `${formatNumber(data.totalWorkers)} میں سے ${formatNumber(data.totalWorkers ? offset + 1 : 0)}–${formatNumber(offset + visibleWorkers.length)} کارکن · صفحہ ${formatNumber(Math.floor(offset / PAGE_SIZE) + 1)} از ${formatNumber(Math.max(1, Math.ceil(data.totalWorkers / PAGE_SIZE)))}`)}</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!offset || !!Object.keys(drafts).length || save.isPending || copying} onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setSelectedWorkers([]); setSelectedDates([]); }}>{text("الصفحة السابقة", "Previous page", "پچھلا صفحہ")}</Button>
              <Button variant="outline" disabled={offset + PAGE_SIZE >= data.totalWorkers || !!Object.keys(drafts).length || save.isPending || copying} onClick={() => { setOffset(offset + PAGE_SIZE); setSelectedWorkers([]); setSelectedDates([]); }}>{text("الصفحة التالية", "Next page", "اگلا صفحہ")}</Button>
            </div>
          </div>
          {!!Object.keys(drafts).length && <p className="text-xs text-amber-800 dark:text-amber-300">{text("احفظ تعديلات الصفحة أو تراجع عنها قبل البحث أو تغيير المركز أو الصفحة.", "Save or discard this page’s changes before searching or changing cost center or page.", "تلاش یا لاگت مرکز یا صفحہ تبدیل کرنے سے پہلے تبدیلیاں محفوظ کریں یا واپس لیں۔")}</p>}
          <p className="text-xs text-muted-foreground lg:hidden">
            {text("اسحب الجدول أفقيًا لمشاهدة بقية الأيام ورصيد الأسبوع.", "Scroll horizontally to view the remaining days and weekly balance.", "باقی دن اور ہفتہ وار اوقات دیکھنے کے لیے جدول کو افقی اسکرول کریں۔")}
          </p>
            <div ref={virtual.scrollRef} style={virtual.viewportStyle} className="overflow-x-auto rounded-xl border bg-background" tabIndex={0} aria-label={text("جدول عمال الصفحة، مرر لعرض بقية العمال", "Worker schedule, scroll to view more workers", "کارکنوں کا شیڈول، مزید کارکنوں کو دیکھنے کے لیے اسکرول کریں")}>
            <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm" aria-rowcount={visibleWorkers.length + 1}>
              <colgroup><col style={{width:224}} />{dates.map((date) => <col key={date} style={{width:112}} />)}<col style={{width:112}} /></colgroup>
              <thead ref={virtual.headerRef} className="sticky top-0 z-20 bg-muted">
                <tr>
                  <th className={`sticky ${language === "en" ? "left-0" : "right-0"} z-20 min-w-48 bg-muted p-3 text-start`}>
                    {text("العامل", "Worker", "کارکن")}{" "}
                    {canEdit && (
                      <label className="mt-2 flex items-center gap-2 font-normal">
                        <input
                          type="checkbox"
                          aria-label={text("تحديد جميع عمال الصفحة", "Select all workers on this page", "اس صفحے کے تمام کارکن منتخب کریں")}
                          checked={
                            !!visibleWorkers.length &&
                            visibleWorkers.every((w) =>
                              selectedWorkers.includes(w.id),
                            )
                          }
                          onChange={(e) =>
                            setSelectedWorkers(
                              e.target.checked
                                ? visibleWorkers.map((w) => w.id)
                                : [],
                            )
                          }
                        />
                        {text("تحديد عمال الصفحة", "Select page workers", "صفحے کے کارکن منتخب کریں")}
                      </label>
                    )}
                  </th>
                  {dates.map((date, i) => (
                    <th key={date} className="min-w-28 border-r p-3">
                      <div>{weekday(i)}</div>
                      <div className="mt-1 text-xs font-normal" dir="ltr">
                        {date.slice(5)}
                      </div>
                      {canEdit && (
                        <input
                          className="mt-2"
                          type="checkbox"
                          aria-label={text(`تحديد ${weekday(i)}`, `Select ${weekday(i)}`, `${weekday(i)} منتخب کریں`)}
                          checked={selectedDates.includes(date)}
                          onChange={(e) =>
                            setSelectedDates((current) =>
                              e.target.checked
                                ? [...current, date]
                                : current.filter((d) => d !== date),
                            )
                          }
                        />
                      )}
                    </th>
                  ))}
                  <th className="min-w-28 border-r p-3">{text("رصيد الأسبوع", "Weekly balance", "ہفتہ وار اوقات")}</th>
                </tr>
              </thead>
              <tbody>
                {virtual.paddingTop > 0 && <tr aria-hidden="true"><td colSpan={9} style={{height:virtual.paddingTop,padding:0,border:0}} /></tr>}
                {visibleWorkers.slice(virtual.startIndex, virtual.endIndex).map((worker, rowIndex) => (
                  <WeeklyRosterRow
                    key={worker.id}
                    worker={worker}
                    destinations={destinations}
                    model={model.get(worker.id)!}
                    dates={dates}
                    selected={selectedWorkers.includes(worker.id)}
                    canSelect={canEdit}
                    editingEnabled={canEdit && filtersSettled && !copying && !!ownerId}
                    ownerId={ownerId}
                    weekLocked={weekLocked}
                    savePending={save.isPending}
                    rowIndex={virtual.startIndex + rowIndex + 2}
                    onSelect={selectWorker}
                    onEdit={editCell}
                    measureRow={virtual.measureRow}
                  />
                ))}
                {virtual.paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={9} style={{height:virtual.paddingBottom,padding:0,border:0}} /></tr>}
              </tbody>
            </table>
            {!visibleWorkers.length && (
              <div className="p-10 text-center text-muted-foreground">
                {text("لا يوجد عمال ضمن هذا الاختيار. راجع ربط العمال بالمشرف وإعدادات مركز التكلفة.", "No workers match this selection. Check supervisor assignments and cost center setup.", "اس انتخاب میں کوئی کارکن نہیں۔ سپروائزر کی ذمہ داریوں اور لاگت مرکز کی ترتیب چیک کریں۔")}
              </div>
            )}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {text("الأوقات المعروضة حضور مخطط، والرصيد يحسب العمل بعد استبعاد الراحة المحددة لكل فترة. مجموع الراحة اليومية نصف ساعة. تعديل أسبوع معتمد يعيده مسودة إلى حين إعادة اعتماده. الزيادة المخططة والفعلية تحتاجان مراجعة المشرف واعتماد الشؤون الإدارية، وتبقى البصمة الفعلية محفوظة. تُستخدم جهة العامل المعتادة تلقائيًا، ويمكن تحديد موقع ومهمة مختلفين لكل فترة من إعداد مكان العمل والمهمة.", "The displayed times are planned attendance. Work balances exclude each shift's break. Total daily break is half an hour. Editing an approved week returns it to draft until reapproved. Planned and actual overtime require supervisor review and administration approval; actual clock records remain saved. The worker's usual workplace is used unless a different location or task is selected.", "دکھائے گئے اوقات منصوبہ بند حاضری ہیں۔ کام کے اوقات میں ہر شفٹ کا وقفہ شامل نہیں۔ روزانہ کل وقفہ آدھا گھنٹہ ہے۔ منظور شدہ ہفتے میں ترمیم سے وہ دوبارہ منظوری تک مسودہ بن جاتا ہے۔ منصوبہ بند اور حقیقی اضافی وقت کے لیے سپروائزر کا جائزہ اور انتظامیہ کی منظوری ضروری ہے؛ اصل حاضری محفوظ رہتی ہے۔ مختلف مقام یا کام منتخب نہ ہو تو کارکن کی معمول کی جگہ استعمال ہوتی ہے۔")}
          </p>
        </>
      )}
      <Dialog
        open={!!printPreview}
        onOpenChange={(open) => {
          if (!open) setPrintPreview(null);
        }}
      >
        <DialogContent
          dir={language === "en" ? "ltr" : "rtl"}
          className="flex h-[90vh] max-w-[96vw] flex-col sm:max-w-[96vw]"
        >
          <DialogHeader>
            <DialogTitle>
              {text("معاينة الجدول", "Schedule preview", "شیڈول پیش نظارہ")} — {normalizeDigits(printPreview?.center ?? "")}
            </DialogTitle>
            <DialogDescription>
              {text("راجع جدول المركز ثم اختر الطباعة أو الحفظ بصيغة PDF من نافذة الطباعة. مقاس الورق A4 بالاتجاه الأفقي.", "Review the cost center schedule, then print or save as PDF. Use A4 landscape.", "لاگت مرکز کا شیڈول دیکھیں، پھر پرنٹ کریں یا PDF محفوظ کریں۔ A4 افقی استعمال کریں۔")}
            </DialogDescription>
          </DialogHeader>
          <iframe
            ref={printFrame}
            title="معاينة طباعة الجدول الأسبوعي"
            srcDoc={printPreview?.html ?? ""}
            onLoad={async () => {
              await printFrame.current?.contentDocument?.fonts.ready;
              setPrintReady(true);
            }}
            className="min-h-0 w-full flex-1 rounded-md border bg-white"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintPreview(null)}>
              {text("إغلاق المعاينة", "Close preview", "پیش نظارہ بند کریں")}
            </Button>
            <Button
              disabled={!printReady}
              onClick={() => {
                const previewWindow = printFrame.current?.contentWindow;
                if (!previewWindow) return;
                previewWindow.focus();
                previewWindow.print();
              }}
            >
              <Printer className="h-4 w-4" /> {text("طباعة / حفظ PDF", "Print / Save PDF", "پرنٹ / PDF محفوظ کریں")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent dir={language === "en" ? "ltr" : "rtl"} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {text("فترات العمل", "Work shifts", "کام کی شفٹیں")} ·{" "}
              {normalizeDigits(
                data?.workers.find((w) => w.id === editor?.workerId)?.name ??
                  "",
              )}
            </DialogTitle>
            <DialogDescription>
              {editor?.date} · {text("تعديل فترات المشرف المختار فقط. الأوقات قبل 04:30 تتبع اليوم التالي ضمن اليوم التشغيلي. (+1) تعني اليوم التالي.", "Edit only the selected supervisor’s shifts. Times before 04:30 are on the next calendar day within the operational day. (+1) means the next day.", "صرف منتخب سپروائزر کی شفٹوں میں ترمیم کریں۔ 04:30 سے پہلے کے اوقات عملی دن کے اگلے کیلنڈر دن میں آتے ہیں۔ (+1) کا مطلب اگلا دن ہے۔")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editor?.intervals.map((interval, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`start-${i}`}>{text("من", "From", "سے")}</Label>
                  <Input
                    id={`start-${i}`}
                    type="time"
                    value={interval.startTime}
                    onChange={(e) =>
                      setEditor(
                        (current) =>
                          current && {
                            ...current,
                            intervals: current.intervals.map((v, j) =>
                              j === i ? { ...v, startTime: e.target.value } : v,
                            ),
                          },
                      )
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`end-${i}`}>{text("إلى", "To", "تک")}</Label>
                  <Input
                    id={`end-${i}`}
                    type="time"
                    value={interval.endTime}
                    onChange={(e) =>
                      setEditor(
                        (current) =>
                          current && {
                            ...current,
                            intervals: current.intervals.map((v, j) =>
                              j === i ? { ...v, endTime: e.target.value } : v,
                            ),
                          },
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`break-${i}`}>{text("راحة", "Break", "وقفہ")}</Label>
                  <select
                    id={`break-${i}`}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={interval.breakMinutes ?? 0}
                    onChange={(e) =>
                      setEditor(
                        (current) =>
                          current && {
                            ...current,
                            intervals: current.intervals.map((v, j) =>
                              j === i
                                ? { ...v, breakMinutes: Number(e.target.value) }
                                : v,
                            ),
                          },
                      )
                    }
                  >
                    <option value={0}>{text("بدون", "None", "کوئی نہیں")}</option>
                    <option value={30}>{text("30 دقيقة", "30 minutes", "30 منٹ")}</option>
                  </select>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`حذف الفترة ${i + 1}`}
                  onClick={() =>
                    setEditor(
                      (current) =>
                        current && {
                          ...current,
                          intervals: current.intervals.filter(
                            (_, j) => j !== i,
                          ),
                        },
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                </div>
                {editingWorker && <PeriodDestinationEditor
                  index={i}
                  worker={editingWorker}
                  interval={interval}
                  catalog={destinations}
                  onChange={(change) => setEditor((current) => current && ({
                    ...current,
                    intervals: current.intervals.map((value, j) => j === i ? { ...value, ...change } : value),
                  }))}
                />}
              </div>
            ))}
            <Button
              variant="outline"
              disabled={(editor?.intervals.length ?? 0) >= 6}
              onClick={() =>
                setEditor(
                  (current) =>
                    current && {
                      ...current,
                      intervals: [
                        ...current.intervals,
                        { startTime: "", endTime: "" },
                      ],
                    },
                )
              }
            >
              <Plus className="h-4 w-4" />
              {text("إضافة فترة", "Add shift", "شفٹ شامل کریں")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {text("حذف جميع الفترات يفرغ دوام هذا المشرف في اليوم. اختر عمالًا وأيامًا من الجدول إذا أردت تطبيق نفس الفترات على مجموعة.", "Removing all shifts clears this supervisor’s work for the day. Select workers and days in the schedule to apply the same shifts to a group.", "تمام شفٹیں حذف کرنے سے اس دن کے لیے اس سپروائزر کا کام خالی ہو جائے گا۔ ایک جیسی شفٹیں گروپ پر لاگو کرنے کے لیے کارکن اور دن منتخب کریں۔")}
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {normalizeDigits(error)}
              </p>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!selectedWorkers.length || !selectedDates.length}
              onClick={() => stageEditor(true)}
            >
              {text(`تطبيق على المحدد (${selectedWorkers.length} عامل × ${selectedDates.length} يوم)`, `Apply to selection (${selectedWorkers.length} workers × ${selectedDates.length} days)`, `منتخب پر لاگو کریں (${selectedWorkers.length} کارکن × ${selectedDates.length} دن)`)}
            </Button>
            <Button onClick={() => stageEditor(false)}>
              <CalendarDays className="h-4 w-4" />
              {text("تطبيق على هذا اليوم", "Apply to this day", "اس دن پر لاگو کریں")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
