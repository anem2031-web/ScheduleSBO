import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Loader2,
  RefreshCcw,
  Search,
  Settings,
  Timer,
  Users,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { hoursLabel, riyadhDateKey, riyadhTime } from "@/lib/operational-date";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { permits } from "@shared/access-control";
import { operationalDate } from "@shared/operational-day";
import { useLanguage } from "@/lib/i18n";

export default function Dashboard() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const [, navigate] = useLocation();
  const [date, setDate] = useState(operationalDate);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const role = user?.role ?? "";
  const allowed = (...codes: string[]) => codes.some(code => permits(user?.permissions ?? [], code));
  const canDaily = allowed("attendance:read");
  const canWorkers = allowed("workers:read");
  const canSchedule = allowed("schedule:read");
  const canReview = allowed("attendance:read", "attendance:approve", "leave:read");
  const canOvertime = allowed("overtime:read");
  const canSetup = ["admin", "hr_admin"].includes(role) && allowed("org_structure:read", "users:read", "workers:create");
  const query = trpc.operations.dailyOverview.useQuery(
    { date },
    { enabled: canDaily && Boolean(date), refetchInterval: 60_000 },
  );
  const rows = useMemo(
    () =>
      (query.data?.rows ?? []).filter((row) => {
        const matches = [row.name, row.employeeId, row.department ?? ""].some(
          (value) => value.toLowerCase().includes(search.toLowerCase()),
        );
        return (
          matches &&
          (filter === "all" ||
            (filter === "onSite" && row.onSite) ||
            (filter === "noPunch" && !row.attended) ||
            (filter === "unplanned" && (row.remainingToSchedule ?? 0) > 0))
        );
      }),
    [query.data, search, filter],
  );
  const summary = query.data?.summary;
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [date, search, filter]);
  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);
  const links = [
    {
      label: text("إعداد الجدول الأسبوعي", "Prepare weekly schedule", "ہفتہ وار شیڈول بنائیں"),
      description: text("الأحد إلى السبت", "Sunday to Saturday", "اتوار سے ہفتہ"),
      path: "/schedules",
      icon: CalendarDays,
      show: canSchedule,
    },
    {
      label: role === "supervisor" ? text("بطاقات عمالي", "My workers", "میرے کارکنان") : text("بطاقات العمال", "Worker profiles", "کارکنوں کے پروفائل"),
      description: text("الدوام والبيانات والارتباطات", "Schedules, details and assignments", "اوقات، تفصیلات اور ذمہ داریاں"),
      path: "/workers",
      icon: Users,
      show: canWorkers,
    },
    {
      label: text("العمل الإضافي", "Overtime", "اضافی کام"),
      description: text("الزيادات وقرارات اعتمادها", "Overtime and approval decisions", "اضافی اوقات اور منظوری کے فیصلے"),
      path: "/overtime",
      icon: Timer,
      show: canOvertime,
    },
    {
      label: text("المراجعات والاعتمادات", "Reviews and approvals", "جائزے اور منظوری"),
      description: text("طلبات تحتاج متابعة", "Requests needing attention", "توجہ طلب درخواستیں"),
      path: "/requests",
      icon: CheckSquare,
      show: canReview,
    },
    {
      label: text("تهيئة البرنامج", "System setup", "سسٹم کی ترتیب"),
      description: text("الهيكل، المشرفون، العمال", "Organization, supervisors and workers", "تنظیم، سپروائزر اور کارکن"),
      path: "/settings",
      icon: Settings,
      show: canSetup,
    },
  ].filter((link) => link.show);

  return (
    <DashboardLayout>
      <div dir={language === "en" ? "ltr" : "rtl"} className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">{text("اليوم", "Today", "آج")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {role === "supervisor"
                ? text("متابعة العمال المرتبطين بك وترتيب ساعاتهم.", "Track your workers and arrange their hours.", "اپنے کارکنوں اور ان کے اوقات کی نگرانی کریں۔")
                : text("الحضور والجدولة والإجراءات التي تحتاج متابعتك.", "Attendance, schedules and actions needing attention.", "حاضری، شیڈول اور توجہ طلب کام۔")}
            </p>
          </div>
          {canDaily && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="overview-date" className="mb-2 block">
                  {text("تاريخ المتابعة", "Overview date", "جائزے کی تاریخ")}
                </Label>
                <Input
                  id="overview-date"
                  aria-label={text("تاريخ المتابعة", "Overview date", "جائزے کی تاریخ")}
                  type="date"
                  value={date}
                  onChange={(event) => {
                    if (event.target.value) setDate(event.target.value);
                  }}
                  className="w-40"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setDate(operationalDate())}
              >
                {text("اليوم", "Today", "آج")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={text("تحديث المتابعة", "Refresh overview", "جائزہ تازہ کریں")}
                disabled={query.isFetching}
                onClick={() => query.refetch()}
              >
                <RefreshCcw
                  className={
                    query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                  }
                />
              </Button>
            </div>
          )}
        </div>
        {links.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {links.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/60"
              >
                <link.icon className="h-6 w-6 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{link.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        {!canDaily && user && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm text-muted-foreground">
                {role === "worker" ? text("يمكنك متابعة بياناتك وجدولك من بطاقتك الشخصية.", "View your details and schedule in your profile.", "اپنی تفصیلات اور شیڈول اپنے پروفائل میں دیکھیں۔") : text("حسابك لا يتيح متابعة حضور جميع العمال.", "Your account cannot view attendance for all workers.", "آپ کے اکاؤنٹ کو تمام کارکنوں کی حاضری دیکھنے کی اجازت نہیں۔")}
              </p>
              {role === "worker" && user.workerId && <Button variant="outline" onClick={() => navigate(`/workers/${user.workerId}`)}>{text("فتح بطاقتي وجدولي", "Open my profile and schedule", "میرا پروفائل اور شیڈول کھولیں")}</Button>}
              {allowed("payroll:read") && (
                <Button variant="outline" onClick={() => navigate("/payroll")}>
                  {text("فتح الرواتب", "Open payroll", "تنخواہیں کھولیں")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {canDaily && (
          <>
            {query.isError && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              >
                {text("تعذر تحميل المتابعة.", "Could not load the overview.", "جائزہ لوڈ نہیں ہو سکا۔")} {query.error.message}
                <Button variant="link" onClick={() => query.refetch()}>
                  {text("إعادة المحاولة", "Try again", "دوبارہ کوشش کریں")}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                [text("العمال", "Workers", "کارکنان"), summary?.workers],
                [text("سجّلوا الحضور", "Checked in", "حاضری درج"), summary?.attended],
                [text("على رأس العمل", "On site", "کام پر موجود"), summary?.onSite],
                [text("حضور متأخر", "Late arrivals", "دیر سے آنے والے"), summary?.late],
              ].map(([label, value]) => (
                <Card key={String(label)}>
                  <CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-3 text-3xl font-bold tabular-nums">
                      {query.isLoading ? "…" : (value ?? "—")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {Boolean(summary?.incompleteSetup) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <p>
                  {text(`هناك ${summary?.incompleteSetup} عامل لم تُستكمل ساعاتهم اليومية أو أيام راحتهم.`, `${summary?.incompleteSetup} workers need daily hours or rest days configured.`, `${summary?.incompleteSetup} کارکنوں کے روزانہ اوقات یا آرام کے دن مقرر نہیں ہیں۔`)}
                </p>
                {canWorkers && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/workers")}
                  >
                    {text("مراجعة بطاقات العمال", "Review worker profiles", "کارکنوں کے پروفائل کا جائزہ")}
                  </Button>
                )}
              </div>
            )}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <h2 className="font-semibold">{text("متابعة الحضور والساعات", "Attendance and hours", "حاضری اور اوقات")}</h2>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {text("الساعات المسجلة من سجلات الحضور المكتملة. المتبقي للجدولة = الساعات المطلوبة ناقص المخطط؛ لا يعني اعتماد ساعات العمل.", "Recorded hours come from completed attendance records. Remaining to schedule is required hours minus planned hours; it does not mean work hours are approved.", "درج شدہ اوقات مکمل حاضری ریکارڈ سے ہیں۔ باقی شیڈول مطلوبہ اوقات میں سے منصوبہ بند اوقات نکال کر ہے؛ یہ کام کے اوقات کی منظوری نہیں۔")}
                    </p>
                  </div>
                  {["admin", "hr_admin"].includes(role) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/attendance")}
                    >
                      {text("تفاصيل الحضور", "Attendance details", "حاضری کی تفصیلات")}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      aria-label={text("البحث في المتابعة", "Search overview", "جائزے میں تلاش کریں")}
                      placeholder={text("اسم العامل، رقمه، أو القسم", "Worker name, number, or department", "کارکن کا نام، نمبر یا شعبہ")}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="pr-9"
                    />
                  </div>
                  <select
                    aria-label={text("تصفية المتابعة", "Filter overview", "جائزہ فلٹر کریں")}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">{text("كل العمال", "All workers", "تمام کارکنان")}</option>
                    <option value="onSite">{text("على رأس العمل", "On site", "کام پر موجود")}</option>
                    <option value="noPunch">{text("لم يسجلوا حضورًا", "Not checked in", "حاضری درج نہیں")}</option>
                    <option value="unplanned">
                      {text("لديهم ساعات متبقية للجدولة", "Hours remaining to schedule", "شیڈول کے لیے باقی اوقات")}
                    </option>
                  </select>
                </div>
                {rows.length > 0 && <nav aria-label={text("صفحات المتابعة اليومية", "Daily overview pages", "روزانہ جائزے کے صفحات")} className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{text(`عرض ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)} من ${rows.length} عامل`, `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)} of ${rows.length} workers`, `${rows.length} میں سے ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)} کارکن` )}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}>{text("السابق", "Previous", "پچھلا")}</Button><span>{text(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`, `صفحہ ${page} از ${pageCount}`)}</span><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>{text("التالي", "Next", "اگلا")}</Button></div></nav>}
                {query.isLoading ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : query.isError ? null : rows.length === 0 ? (
                  <div className="space-y-3 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {summary?.workers
                        ? text("لا توجد نتائج مطابقة.", "No matching results.", "کوئی مماثل نتیجہ نہیں۔")
                        : text("لا يوجد عمال متاحون للمتابعة ضمن صلاحياتك.", "No workers are available within your permissions.", "آپ کی اجازتوں میں کوئی کارکن دستیاب نہیں۔")}
                    </p>
                    {canSetup && !summary?.workers && (
                      <Button onClick={() => navigate("/settings")}>
                        {text("ابدأ بالتهيئة", "Start setup", "ترتیب شروع کریں")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[800px] text-start text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          {[
                            text("العامل", "Worker", "کارکن"),
                            text("القسم", "Department", "شعبہ"),
                            text("الحالة", "Status", "حالت"),
                            text("الحضور", "Check in", "آمد"),
                            text("الانصراف", "Check out", "روانگی"),
                            text("المخطط", "Planned", "منصوبہ بند"),
                            text("الساعات المسجلة", "Recorded hours", "درج شدہ اوقات"),
                            text("المتبقي للجدولة", "Remaining to schedule", "شیڈول کے لیے باقی"),
                            "",
                          ].map((label, index) => (
                            <th
                              key={index}
                              className="whitespace-nowrap px-3 py-3 font-medium"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-border/60 last:border-0"
                          >
                            <td className="px-3 py-4">
                              <p className="font-medium">{row.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.employeeId}
                              </p>
                            </td>
                            <td className="px-3 py-4">
                              {row.department || "—"}
                            </td>
                            <td className="px-3 py-4">
                              <Badge variant="outline">
                                {row.onSite
                                  ? text("على رأس العمل", "On site", "کام پر موجود")
                                  : row.attended
                                    ? text("انصرف", "Checked out", "روانہ ہو گیا")
                                    : row.isRestDay
                                      ? text("راحة", "Rest day", "آرام کا دن")
                                      : row.isLeaveDay
                                        ? text("إجازة", "Leave", "چھٹی")
                                        : row.isHolidayDay
                                          ? text("عطلة", "Holiday", "تعطیل")
                                          : text("لا يوجد حضور", "Not checked in", "حاضری درج نہیں")}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {riyadhTime(row.checkIn)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {riyadhTime(row.checkOut)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.plannedHours, language)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.actualHours, language)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.remainingToSchedule, language)}
                            </td>
                            <td className="px-3 py-4">
                              {canWorkers && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => navigate("/workers/" + row.id)}
                                >
                                  {text("البطاقة", "Profile", "پروفائل")}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
