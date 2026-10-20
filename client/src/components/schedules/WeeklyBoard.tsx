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
export type { BoardWorker, BoardAssignment } from "./weekly-board-model";
import type { BoardWorker, BoardAssignment } from "./weekly-board-model";

type Draft = RosterDraft;
const cellKey = rosterCellKey;
const PAGE_SIZE = 32;
const EMPTY_ASSIGNMENTS: BoardAssignment[] = [];

export function WeeklyBoard() {
  const { language } = useLanguage();
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
  const canExport = permits(user?.permissions ?? [], "schedule:export");
  const period = data?.periods.find(
    (p) => p.startDate && p.status !== "cancelled",
  );
  const approve = trpc.schedules.publishPeriod.useMutation({
    onSuccess: () => {
      setMessage("تم اعتماد ونشر الجدول الأسبوعي");
      utils.schedules.getWeeklyBoard.invalidate();
      utils.schedules.getWeeklyBoardPage.invalidate();
      utils.schedules.getWeeklyBoardExport.invalidate();
      utils.schedules.listPeriods.invalidate();
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
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الجدول الأسبوعي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            رتّب فترات العمل من الأحد إلى السبت، وراجع رصيد العامل بين جميع
            مشرفيه.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportRoster(false)}
            disabled={!data || !canExport || exporting}
          >
            <Printer className="h-4 w-4" /> طباعة / PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => exportRoster(true)}
            disabled={!data || !canExport || exporting}
          >
            <Download className="h-4 w-4" /> صورة
          </Button>
          {exporting && <span role="status" className="self-center text-sm">جارٍ تجهيز جدول المركز كاملًا…</span>}
        </div>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <div className="space-y-2">
            <Label htmlFor="roster-week">أي يوم من الأسبوع المطلوب</Label>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label="الأسبوع السابق"
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
                aria-label="الأسبوع التالي"
                disabled={save.isPending || copying}
                onClick={() => changeWeek(addCalendarDays(weekStart, 7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="roster-center">مركز التكلفة</Label>
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
              <option value="">جميع المراكز</option>
              {centers.map((name) => (
                <option key={name} value={name}>
                  {normalizeDigits(name)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48 space-y-2">
            <Label htmlFor="roster-search">البحث عن عامل</Label>
            <Input
              id="roster-search"
              value={search}
              disabled={Object.keys(drafts).length > 0 || save.isPending || copying}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="الاسم أو الرقم أو القسم"
            />
          </div>
          {canEdit && user?.role !== "supervisor" && (
            <div className="space-y-2">
              <Label htmlFor="roster-supervisor">
                المشرف المسؤول عن الفترات
              </Label>
              <select
                id="roster-supervisor"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={supervisorId ?? ""}
                onChange={(e) => changeOwner(e.target.value)}
                disabled={save.isPending || copying}
              >
                <option value="">اختر المشرف للتعديل</option>
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
          هذا الأسبوع مقفل أو مؤرشف. يمكنك مراجعته وتصديره؛ إعادة فتحه من صلاحية
          الإدارة.
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center gap-2 py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          جارٍ تحميل الأسبوع…
        </div>
      ) : !data ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              من <b dir="ltr">{weekStart}</b> إلى{" "}
              <b dir="ltr">{data.weekEnd}</b> · {formatNumber(data.totalWorkers)} عامل ·{" "}
              <span className="text-blue-700 dark:text-blue-300">
                الأزرق: فترات المشرف المختار
              </span>{" "}
              ·{" "}
              <span className="text-violet-700 dark:text-violet-300">
                البنفسجي: فترات المشرفين الآخرين
              </span>
            </p>
            {canApprove && period?.status === "draft" && (
              <Button
                disabled={approve.isPending || Object.keys(drafts).length > 0}
                onClick={() => approve.mutate({ periodId: period.id })}
              >
                اعتماد ونشر الأسبوع
              </Button>
            )}
            <span className="text-sm">
              {period?.status === "published"
                ? "معتمد ومنشور"
                : "مسودة — يحتاج اعتمادًا"}
            </span>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={copyLastWeek}
                  disabled={!ownerId || copying || save.isPending || weekLocked || !visibleWorkers.length || !filtersSettled}
                >
                  <Copy className="h-4 w-4" />
                  {copying ? "جارٍ النسخ…" : "نسخ فتراتي لعمال الصفحة من الأسبوع السابق"}
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
                  تراجع عن التعديلات
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
                  حفظ الأسبوع{" "}
                  {Object.keys(drafts).length
                    ? `(${Object.keys(drafts).length})`
                    : ""}
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="صفحات العمال">
            <span role="status">عرض {formatNumber(data.totalWorkers ? offset + 1 : 0)}–{formatNumber(offset + visibleWorkers.length)} من {formatNumber(data.totalWorkers)} عامل · الصفحة {formatNumber(Math.floor(offset / PAGE_SIZE) + 1)} من {formatNumber(Math.max(1, Math.ceil(data.totalWorkers / PAGE_SIZE)))}</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!offset || !!Object.keys(drafts).length || save.isPending || copying} onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setSelectedWorkers([]); setSelectedDates([]); }}>الصفحة السابقة</Button>
              <Button variant="outline" disabled={offset + PAGE_SIZE >= data.totalWorkers || !!Object.keys(drafts).length || save.isPending || copying} onClick={() => { setOffset(offset + PAGE_SIZE); setSelectedWorkers([]); setSelectedDates([]); }}>الصفحة التالية</Button>
            </div>
          </div>
          {!!Object.keys(drafts).length && <p className="text-xs text-amber-800 dark:text-amber-300">احفظ تعديلات الصفحة أو تراجع عنها قبل البحث أو تغيير المركز أو الصفحة.</p>}
          <p className="text-xs text-muted-foreground lg:hidden">
            اسحب الجدول أفقيًا لمشاهدة بقية الأيام ورصيد الأسبوع.
          </p>
          <div ref={virtual.scrollRef} style={virtual.viewportStyle} className="overflow-x-auto rounded-xl border bg-background" tabIndex={0} aria-label="جدول عمال الصفحة، مرر لعرض بقية العمال">
            <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm" aria-rowcount={visibleWorkers.length + 1}>
              <colgroup><col style={{width:224}} />{dates.map((date) => <col key={date} style={{width:112}} />)}<col style={{width:112}} /></colgroup>
              <thead ref={virtual.headerRef} className="sticky top-0 z-20 bg-muted">
                <tr>
                  <th className="sticky right-0 z-20 min-w-48 bg-muted p-3 text-right">
                    العامل{" "}
                    {canEdit && (
                      <label className="mt-2 flex items-center gap-2 font-normal">
                        <input
                          type="checkbox"
                          aria-label="تحديد جميع عمال الصفحة"
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
                        تحديد عمال الصفحة
                      </label>
                    )}
                  </th>
                  {dates.map((date, i) => (
                    <th key={date} className="min-w-28 border-r p-3">
                      <div>{WEEK_DAY_NAMES[i]}</div>
                      <div className="mt-1 text-xs font-normal" dir="ltr">
                        {date.slice(5)}
                      </div>
                      {canEdit && (
                        <input
                          className="mt-2"
                          type="checkbox"
                          aria-label={`تحديد ${WEEK_DAY_NAMES[i]}`}
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
                  <th className="min-w-28 border-r p-3">رصيد الأسبوع</th>
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
                لا يوجد عمال ضمن هذا الاختيار. راجع ربط العمال بالمشرف وإعدادات
                مركز التكلفة.
              </div>
            )}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            الأوقات المعروضة حضور مخطط، والرصيد يحسب العمل بعد استبعاد الراحة
            المحددة لكل فترة. مجموع الراحة اليومية نصف ساعة. تعديل أسبوع معتمد
            يعيده مسودة إلى حين إعادة اعتماده. الزيادة المخططة والفعلية تحتاجان
            مراجعة المشرف واعتماد الشؤون الإدارية، وتبقى البصمة الفعلية محفوظة.
            تُستخدم جهة العامل المعتادة تلقائيًا، ويمكن تحديد موقع ومهمة مختلفين
            لكل فترة من إعداد مكان العمل والمهمة.
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
          dir="rtl"
          className="flex h-[90vh] max-w-[96vw] flex-col sm:max-w-[96vw]"
        >
          <DialogHeader>
            <DialogTitle>
              معاينة الجدول — {normalizeDigits(printPreview?.center ?? "")}
            </DialogTitle>
            <DialogDescription>
              راجع جدول المركز ثم اختر الطباعة أو الحفظ بصيغة PDF من نافذة
              الطباعة. مقاس الورق A4 بالاتجاه الأفقي.
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
              إغلاق المعاينة
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
              <Printer className="h-4 w-4" /> طباعة / حفظ PDF
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
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              فترات العمل ·{" "}
              {normalizeDigits(
                data?.workers.find((w) => w.id === editor?.workerId)?.name ??
                  "",
              )}
            </DialogTitle>
            <DialogDescription>
              {editor?.date} · تعديل فترات المشرف المختار فقط. الأوقات قبل 04:30
              تتبع اليوم التالي ضمن اليوم التشغيلي. (+1) تعني اليوم التالي.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editor?.intervals.map((interval, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`start-${i}`}>من</Label>
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
                  <Label htmlFor={`end-${i}`}>إلى</Label>
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
                  <Label htmlFor={`break-${i}`}>راحة</Label>
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
                    <option value={0}>بدون</option>
                    <option value={30}>30 دقيقة</option>
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
              إضافة فترة
            </Button>
            <p className="text-xs text-muted-foreground">
              حذف جميع الفترات يفرغ دوام هذا المشرف في اليوم. اختر عمالًا
              وأيامًا من الجدول إذا أردت تطبيق نفس الفترات على مجموعة.
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
              تطبيق على المحدد ({selectedWorkers.length} عامل ×{" "}
              {selectedDates.length} يوم)
            </Button>
            <Button onClick={() => stageEditor(false)}>
              <CalendarDays className="h-4 w-4" />
              تطبيق على هذا اليوم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
