import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { OvertimeGrid } from "@/components/overtime/OvertimeGrid";
import {
  OvertimeDetails,
  type OvertimeDecision,
} from "@/components/overtime/OvertimeDetails";
import { PlannedOvertimeDialog } from "@/components/overtime/PlannedOvertimeDialog";
import {
  durationLabel,
  monthRange,
  overtimeFilters,
  overtimeRows,
  overtimePage,
  OVERTIME_PAGE_SIZE,
  rowMatchesFilter,
  rowNeedsAction,
  type OvertimeCenter,
  type OvertimeFilter,
  type OvertimeRow,
} from "@/components/overtime/overtime-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { riyadhDateKey } from "@/lib/operational-date";
import { normalizeDigits } from "@shared/display-format";
import { permits } from "@shared/access-control";
import { toast } from "sonner";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
function initialWorkerId() {
  const value = Number(
    new URLSearchParams(window.location.search).get("workerId"),
  );
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export default function Overtime() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const canRead = permits(user?.permissions ?? [], "overtime:read");
  const initialRange = monthRange(riyadhDateKey());
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [search, setSearch] = useState("");
  const [centerId, setCenterId] = useState("");
  const [status, setStatus] = useState<OvertimeFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const validRange = Boolean(
    fromDate &&
    toDate &&
    fromDate <= toDate &&
    Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`) <=
      93 * 86_400_000,
  );
  const query = trpc.overtime.list.useQuery(
    { workerId, fromDate, toDate },
    { enabled: canRead && validRange },
  );
  const utils = trpc.useUtils();
  const changed = async () => {
    setSelectedKey(null);
    setCreateOpen(false);
    await Promise.all([
      utils.overtime.invalidate(),
      utils.schedules.invalidate(),
      utils.operations.invalidate(),
      utils.attendance.invalidate(),
    ]);
    toast.success("تم حفظ إجراء العمل الإضافي");
  };
  const error = (failure: { message: string }) =>
    toast.error(normalizeDigits(failure.message));
  const create = trpc.overtime.create.useMutation({
    onSuccess: changed,
    onError: error,
  });
  const review = trpc.overtime.review.useMutation({
    onSuccess: changed,
    onError: error,
  });
  const decide = trpc.overtime.decide.useMutation({
    onSuccess: changed,
    onError: error,
  });
  const reopen = trpc.overtime.reopen.useMutation({
    onSuccess: changed,
    onError: error,
  });
  const busy =
    create.isPending ||
    review.isPending ||
    decide.isPending ||
    reopen.isPending;
  const rows = useMemo(
    () => overtimeRows(validRange ? query.data : undefined),
    [query.data, validRange],
  );
  const centers = useMemo(() => {
    const result = new Map<number, OvertimeCenter>();
    for (const center of query.data?.centers ?? [])
      result.set(center.id, center);
    for (const row of rows)
      if (!result.has(row.costCenterId ?? -1))
        result.set(row.costCenterId ?? -1, {
          id: row.costCenterId ?? -1,
          nameAr: row.costCenterName ?? "مركز غير محدد",
        });
    return Array.from(result.values());
  }, [query.data?.centers, rows]);
  const matching = useMemo(() => {
    const needle = normalizeDigits(search.trim()).toLocaleLowerCase();
    return rows.filter(
      (row) =>
        (!centerId || String(row.costCenterId ?? -1) === centerId) &&
        rowMatchesFilter(row, status) &&
        (!needle ||
          normalizeDigits(`${row.name} ${row.employeeId}`)
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [rows, centerId, status, search]);
  const pagination = overtimePage(matching, page);
  const totalPages = pagination.totalPages;
  const activePage = pagination.page;
  const visibleRows = pagination.items;
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const actionableCount = rows.filter(rowNeedsAction).length;
  const approvedMinutes = matching.reduce(
    (total, row) => total + (row.status === "approved" ? row.minutes : 0),
    0,
  );
  useEffect(() => {
    setPage(1);
    setSelectedKey(null);
  }, [fromDate, toDate, workerId, centerId, status, search]);
  const handleDecision = (row: OvertimeRow, decision: OvertimeDecision) => {
    if (decision.kind === "reopen" && row.id !== null)
      reopen.mutate({ id: row.id, reason: decision.note });
    else if (decision.kind === "submit" && row.assignmentId && row.attendanceId)
      create.mutate({
        assignmentId: row.assignmentId,
        attendanceId: row.attendanceId,
        overtimeKind: "actual",
        reason: decision.note,
      });
    else if (
      decision.kind === "review" &&
      row.id === null &&
      row.assignmentId &&
      row.attendanceId
    )
      create.mutate({
        assignmentId: row.assignmentId,
        attendanceId: row.attendanceId,
        overtimeKind: "actual",
        reason: decision.note,
        initialDecision: decision.approved,
      });
    else if (decision.kind === "review" && row.id !== null)
      review.mutate({
        id: row.id,
        approved: decision.approved,
        note: decision.note,
      });
    else if (decision.kind === "final" && row.id !== null)
      decide.mutate({
        id: row.id,
        approved: decision.approved,
        note: decision.note || undefined,
      });
  };
  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">العمل الإضافي</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              مراجعة الزيادات المخططة والفعلية واعتمادها حسب العامل والفترة
              ومركز التكلفة.
            </p>
          </div>
          {canRead && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={query.isFetching || busy || !validRange}
                onClick={() => void query.refetch()}
              >
                <RefreshCw
                  className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
                />
                تحديث
              </Button>
              {query.data?.canCreate && (
                <Button disabled={busy} onClick={() => setCreateOpen(true)}>
                  <Plus className="ml-2 h-4 w-4" />
                  طلب زيادة مخططة
                </Button>
              )}
            </div>
          )}
        </div>
        {!canRead ? (
          <p className="rounded-xl border p-6 text-sm">
            هذه الصفحة غير متاحة لصلاحيات حسابك.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={status === "all" ? "default" : "outline"}
                onClick={() => setStatus("all")}
              >
                جميع الطلبات{" "}
                <span className="mr-2 tabular-nums">{rows.length}</span>
              </Button>
              <Button
                size="sm"
                variant={status === "actionable" ? "default" : "outline"}
                onClick={() => setStatus("actionable")}
              >
                تحتاج إجراء منك{" "}
                <span className="mr-2 tabular-nums">{actionableCount}</span>
              </Button>
              {workerId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWorkerId(undefined);
                    navigate("/overtime");
                  }}
                >
                  عرض جميع العمال
                </Button>
              )}
            </div>
            <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="overtime-from">من تاريخ</Label>
                <Input
                  id="overtime-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overtime-to">إلى تاريخ</Label>
                <Input
                  id="overtime-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overtime-search">العامل</Label>
                <Input
                  id="overtime-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="اسم العامل أو رقمه"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overtime-center">مركز التكلفة</Label>
                <select
                  id="overtime-center"
                  className={selectClass}
                  value={centerId}
                  onChange={(event) => setCenterId(event.target.value)}
                >
                  <option value="">جميع المراكز</option>
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>
                      {normalizeDigits(center.nameAr)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="overtime-status">الحالة</Label>
                <select
                  id="overtime-status"
                  className={selectClass}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as OvertimeFilter)
                  }
                >
                  {overtimeFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!validRange && (
              <p role="alert" className="text-sm text-destructive">
                اختر تاريخ بداية ونهاية صحيحين، لمدة لا تتجاوز 93 يومًا.
              </p>
            )}
            {query.isError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive"
              >
                {normalizeDigits(query.error.message)}
              </p>
            )}
            <OvertimeGrid
              rows={visibleRows}
              centers={centers}
              loading={query.isLoading && validRange}
              onOpen={(row) => setSelectedKey(row.key)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>
                كل صف لزيادة واحدة في فترة ومركز محددين · (+1) اليوم التالي ·
                ساعة 1 ودقيقة 30 = مدة 01:30.
              </p>
              <p>
                إجمالي المعتمد ضمن الفلاتر:{" "}
                <span className="font-semibold text-foreground">
                  {durationLabel(approvedMinutes)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                عرض{" "}
                {matching.length
                  ? (activePage - 1) * OVERTIME_PAGE_SIZE + 1
                  : 0}
                –{Math.min(activePage * OVERTIME_PAGE_SIZE, matching.length)} من{" "}
                {matching.length} · {OVERTIME_PAGE_SIZE} صفًا لكل صفحة
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activePage <= 1}
                  onClick={() => setPage(activePage - 1)}
                >
                  <ChevronRight className="ml-1 h-4 w-4" />
                  السابق
                </Button>
                <span className="px-2 text-sm tabular-nums">
                  {activePage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activePage >= totalPages}
                  onClick={() => setPage(activePage + 1)}
                >
                  التالي
                  <ChevronLeft className="mr-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
        <OvertimeDetails
          row={selected}
          busy={busy}
          onClose={() => setSelectedKey(null)}
          onDecide={handleDecision}
        />
        <PlannedOvertimeDialog
          open={createOpen}
          initialWorkerId={workerId}
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onSubmit={(input) =>
            create.mutate({ ...input, overtimeKind: "planned" })
          }
        />
      </div>
    </DashboardLayout>
  );
}
