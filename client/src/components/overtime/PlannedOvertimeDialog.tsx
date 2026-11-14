import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { normalizeDigits } from "@shared/display-format";
import { riyadhDateKey } from "@/lib/operational-date";
import { clockRange } from "./overtime-model";
import { useLanguage } from "@/lib/i18n";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function PlannedOvertimeDialog({
  open,
  initialWorkerId,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialWorkerId?: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    assignmentId: number;
    endTime: string;
    reason: string;
  }) => void;
}) {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const [workerId, setWorkerId] = useState(
    initialWorkerId ? String(initialWorkerId) : "",
  );
  const [search, setSearch] = useState("");
  const [day, setDay] = useState(riyadhDateKey);
  const [assignmentId, setAssignmentId] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setWorkerId(initialWorkerId ? String(initialWorkerId) : "");
    setSearch("");
    setDay(riyadhDateKey());
    setAssignmentId("");
    setEndTime("");
    setReason("");
  }, [open, initialWorkerId]);
  const options = trpc.overtime.periodOptions.useQuery(
    { workDate: day, workerId: initialWorkerId },
    { enabled: open && Boolean(day) },
  );
  const workers = useMemo(() => {
    const result = new Map<
      number,
      { id: number; name: string; employeeId: string }
    >();
    const needle = normalizeDigits(search.trim()).toLocaleLowerCase();
    for (const item of options.data?.items ?? []) {
      if (
        !needle ||
        normalizeDigits(`${item.name} ${item.employeeId}`)
          .toLocaleLowerCase()
          .includes(needle)
      )
        result.set(item.workerId, {
          id: item.workerId,
          name: item.name,
          employeeId: item.employeeId,
        });
    }
    return Array.from(result.values());
  }, [options.data, search]);
  const eligible =
    options.data?.items.filter(
      (assignment) => assignment.workerId === Number(workerId),
    ) ?? [];
  const selectedAssignment = eligible.find(
    (assignment) => assignment.id === Number(assignmentId),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        dir={language === "en" ? "ltr" : "rtl"}
        className="max-h-[90vh] overflow-y-auto"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{text("طلب عمل إضافي مخطط", "Request planned overtime", "منصوبہ بند اضافی کام کی درخواست")}</DialogTitle>
          <DialogDescription>
            {text("حدد العامل والفترة ونهاية الدوام المطلوبة، واكتب مبررًا واحدًا للزيادة. لا تتمدد الفترة قبل الاعتماد النهائي للشؤون الإدارية.", "Select the worker, shift and requested end time, and provide one reason. The shift is not extended until final administrative approval.", "کارکن، شفٹ اور مطلوبہ اختتامی وقت منتخب کریں، اور وجہ درج کریں۔ انتظامیہ کی حتمی منظوری سے پہلے شفٹ نہیں بڑھائی جاتی۔")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedAssignment)
              onSubmit({
                assignmentId: selectedAssignment.id,
                endTime,
                reason: reason.trim(),
              });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="overtime-create-day">{text("يوم العمل", "Work day", "کام کا دن")}</Label>
            <Input
              id="overtime-create-day"
              type="date"
              value={day}
              required
              disabled={busy}
              onChange={(event) => {
                setDay(event.target.value);
                setAssignmentId("");
                if (!initialWorkerId) setWorkerId("");
              }}
            />
          </div>
          {initialWorkerId ? (
            <div className="rounded-md border p-3 text-sm">
              {text("العامل", "Worker", "کارکن")}:{" "}
              {normalizeDigits(eligible[0]?.name ?? `#${initialWorkerId}`)}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="overtime-worker-search">{text("العامل", "Worker", "کارکن")}</Label>
              <Input
                id="overtime-worker-search"
                type="search"
                placeholder={text("ابحث بالاسم أو الرقم الوظيفي", "Search by name or employee ID", "نام یا ملازم نمبر سے تلاش کریں")}
                value={search}
                disabled={busy}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setWorkerId("");
                  setAssignmentId("");
                }}
              />
              <select
                id="overtime-create-worker"
                aria-label={text("اختر العامل", "Select worker", "کارکن منتخب کریں")}
                required
                className={selectClass}
                value={workerId}
                disabled={busy || options.isLoading}
                onChange={(event) => {
                  setWorkerId(event.target.value);
                  setAssignmentId("");
                }}
              >
                <option value="">
                  {options.isLoading ? text("جارٍ تحميل الفترات…", "Loading shifts…", "شفٹیں لوڈ ہو رہی ہیں…") : text("اختر العامل", "Select worker", "کارکن منتخب کریں")}
                </option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {normalizeDigits(worker.name)} ·{" "}
                    {normalizeDigits(worker.employeeId)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {text("تظهر العمال الذين لديهم فترات يمكنك طلب تمديدها في اليوم المختار.", "Shows workers whose shifts you can request to extend on the selected day.", "منتخب دن میں توسیع کے قابل شفٹوں والے کارکن دکھائے جاتے ہیں۔")}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="overtime-create-assignment">
              {text("الفترة المطلوب تمديدها", "Shift to extend", "توسیع کی مطلوبہ شفٹ")}
            </Label>
            <select
              id="overtime-create-assignment"
              className={selectClass}
              required
              value={assignmentId}
              disabled={busy || !workerId || options.isLoading}
              onChange={(event) => setAssignmentId(event.target.value)}
            >
              <option value="">
                {options.isLoading ? text("جارٍ تحميل الفترات…", "Loading shifts…", "شفٹیں لوڈ ہو رہی ہیں…") : text("اختر الفترة", "Select shift", "شفٹ منتخب کریں")}
              </option>
              {eligible.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {clockRange(assignment.startTime, assignment.endTime)} ·{" "}
                  {normalizeDigits(
                    assignment.costCenterName ?? text("مركز غير محدد", "Cost center not set", "لاگت مرکز مقرر نہیں"),
                  )}
                </option>
              ))}
            </select>
            {workerId &&
              !options.isLoading &&
              !eligible.length &&
              !options.isError && (
                <p className="text-xs text-muted-foreground">
                  {text("لا توجد فترة متاحة لك لتمديدها في هذا اليوم.", "No shift is available for you to extend on this day.", "اس دن آپ کے لیے توسیع کی کوئی شفٹ دستیاب نہیں۔")}
                </p>
              )}
            {options.isError && (
              <p role="alert" className="text-sm text-destructive">
                {normalizeDigits(options.error.message)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="overtime-create-end">
              {text("نهاية الدوام بعد الزيادة", "End time after extension", "توسیع کے بعد اختتامی وقت")}
            </Label>
            <Input
              id="overtime-create-end"
              type="time"
              required
              value={endTime}
              disabled={busy}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="overtime-create-reason">
              {text("مبرر الزيادة (إلزامي)", "Reason for overtime (required)", "اضافی وقت کی وجہ (لازمی)")}
            </Label>
            <Textarea
              id="overtime-create-reason"
              required
              minLength={3}
              maxLength={2000}
              disabled={busy}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={text("مثال: استكمال إغلاق المطعم وتسليم العهدة", "Example: finish closing the restaurant and hand over custody", "مثال: ریستوران بند کرنا اور سامان حوالے کرنا")}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {text("رجوع", "Back", "واپس")}
            </Button>
            <Button
              disabled={
                busy ||
                !selectedAssignment ||
                !endTime ||
                reason.trim().length < 3
              }
            >
              {busy ? text("جارٍ الحفظ…", "Saving…", "محفوظ ہو رہا ہے…") : text("حفظ الطلب وإرساله للاعتماد", "Save and submit for approval", "درخواست محفوظ کر کے منظوری کے لیے بھیجیں")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
