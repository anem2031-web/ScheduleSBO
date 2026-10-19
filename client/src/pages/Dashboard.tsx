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

export default function Dashboard() {
  const { user } = useAuth();
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
      label: "إعداد الجدول الأسبوعي",
      description: "الأحد إلى السبت",
      path: "/schedules",
      icon: CalendarDays,
      show: canSchedule,
    },
    {
      label: role === "supervisor" ? "بطاقات عمالي" : "بطاقات العمال",
      description: "الدوام والبيانات والارتباطات",
      path: "/workers",
      icon: Users,
      show: canWorkers,
    },
    {
      label: "العمل الإضافي",
      description: "الزيادات وقرارات اعتمادها",
      path: "/overtime",
      icon: Timer,
      show: canOvertime,
    },
    {
      label: "المراجعات والاعتمادات",
      description: "طلبات تحتاج متابعة",
      path: "/requests",
      icon: CheckSquare,
      show: canReview,
    },
    {
      label: "تهيئة البرنامج",
      description: "الهيكل، المشرفون، العمال",
      path: "/settings",
      icon: Settings,
      show: canSetup,
    },
  ].filter((link) => link.show);

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">اليوم</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {role === "supervisor"
                ? "متابعة العمال المرتبطين بك وترتيب ساعاتهم."
                : "الحضور والجدولة والإجراءات التي تحتاج متابعتك."}
            </p>
          </div>
          {canDaily && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="overview-date" className="mb-2 block">
                  تاريخ المتابعة
                </Label>
                <Input
                  id="overview-date"
                  aria-label="تاريخ المتابعة"
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
                اليوم
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="تحديث المتابعة"
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
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/60"
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
                {role === "worker" ? "يمكنك متابعة بياناتك وجدولك من بطاقتك الشخصية." : "حسابك لا يتيح متابعة حضور جميع العمال."}
              </p>
              {role === "worker" && user.workerId && <Button variant="outline" onClick={() => navigate(`/workers/${user.workerId}`)}>فتح بطاقتي وجدولي</Button>}
              {allowed("payroll:read") && (
                <Button variant="outline" onClick={() => navigate("/payroll")}>
                  فتح الرواتب
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
                تعذر تحميل المتابعة. {query.error.message}
                <Button variant="link" onClick={() => query.refetch()}>
                  إعادة المحاولة
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                ["العمال", summary?.workers],
                ["سجّلوا الحضور", summary?.attended],
                ["على رأس العمل", summary?.onSite],
                ["حضور متأخر", summary?.late],
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
                  هناك {summary?.incompleteSetup} عامل لم تُستكمل ساعاتهم
                  اليومية أو أيام راحتهم.
                </p>
                {canWorkers && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/workers")}
                  >
                    مراجعة بطاقات العمال
                  </Button>
                )}
              </div>
            )}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <h2 className="font-semibold">متابعة الحضور والساعات</h2>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      الساعات المسجلة من سجلات الحضور المكتملة. المتبقي للجدولة
                      = الساعات المطلوبة ناقص المخطط؛ لا يعني اعتماد ساعات
                      العمل.
                    </p>
                  </div>
                  {["admin", "hr_admin"].includes(role) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/attendance")}
                    >
                      تفاصيل الحضور
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      aria-label="البحث في المتابعة"
                      placeholder="اسم العامل، رقمه، أو القسم"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="pr-9"
                    />
                  </div>
                  <select
                    aria-label="تصفية المتابعة"
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">كل العمال</option>
                    <option value="onSite">على رأس العمل</option>
                    <option value="noPunch">لم يسجلوا حضورًا</option>
                    <option value="unplanned">
                      لديهم ساعات متبقية للجدولة
                    </option>
                  </select>
                </div>
                {rows.length > 0 && <nav aria-label="صفحات المتابعة اليومية" className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} من {rows.length} عامل</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}>السابق</Button><span>صفحة {page} من {pageCount}</span><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>التالي</Button></div></nav>}
                {query.isLoading ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : query.isError ? null : rows.length === 0 ? (
                  <div className="space-y-3 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {summary?.workers
                        ? "لا توجد نتائج مطابقة."
                        : "لا يوجد عمال متاحون للمتابعة ضمن صلاحياتك."}
                    </p>
                    {canSetup && !summary?.workers && (
                      <Button onClick={() => navigate("/settings")}>
                        ابدأ بالتهيئة
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[800px] text-right text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          {[
                            "العامل",
                            "القسم",
                            "الحالة",
                            "الحضور",
                            "الانصراف",
                            "المخطط",
                            "الساعات المسجلة",
                            "المتبقي للجدولة",
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
                                  ? "على رأس العمل"
                                  : row.attended
                                    ? "انصرف"
                                    : row.isRestDay
                                      ? "راحة"
                                      : row.isLeaveDay
                                        ? "إجازة"
                                        : row.isHolidayDay
                                          ? "عطلة"
                                          : "لا يوجد حضور"}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {riyadhTime(row.checkIn)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              {riyadhTime(row.checkOut)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.plannedHours)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.actualHours)}
                            </td>
                            <td className="px-3 py-4">
                              {hoursLabel(row.remainingToSchedule)}
                            </td>
                            <td className="px-3 py-4">
                              {canWorkers && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => navigate("/workers/" + row.id)}
                                >
                                  البطاقة
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
