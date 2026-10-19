import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, normalizeDigits } from "@shared/display-format";
import {
  clockRange,
  dayLabel,
  durationLabel,
  overtimeNoteRequired,
  statusLabel,
  type OvertimeHistory,
  type OvertimeRow,
} from "./overtime-model";

export type OvertimeDecision = {
  kind: "review" | "final" | "reopen" | "submit";
  approved: boolean;
  note: string;
};

function historyTitle(event: OvertimeHistory) {
  if (event.action === "reopen" || event.stage === "admin_reopen")
    return "إعادة فتح الرفض وإرجاعه للشؤون الإدارية";
  if (event.stage === "supervisor")
    return event.approved ? "قبول المشرف المبدئي" : "رفض المشرف";
  if (event.stage === "hr_final")
    return event.approved
      ? "اعتماد الشؤون الإدارية النهائي"
      : "رفض الشؤون الإدارية";
  return event.action === "create"
    ? event.approved === true
      ? "تسجيل الزيادة وقبولها مبدئيًا"
      : event.approved === false
        ? "تسجيل الزيادة ورفضها من المشرف"
        : "تقديم طلب زيادة لمراجعة المشرف"
    : "تحديث الطلب";
}

export function OvertimeDetails({
  row,
  busy,
  onClose,
  onDecide,
}: {
  row: OvertimeRow | null;
  busy: boolean;
  onClose: () => void;
  onDecide: (row: OvertimeRow, decision: OvertimeDecision) => void;
}) {
  const [approved, setApproved] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    setApproved(null);
    setNote("");
  }, [row?.key]);
  const canReview = Boolean(row?.canReview);
  const canDecide = Boolean(row?.canDecide);
  const canReopen = Boolean(row?.canReopen);
  const canSubmit = Boolean(row?.canSubmit);
  const kind = canReopen
    ? "reopen"
    : canSubmit
      ? "submit"
      : canReview
        ? "review"
        : "final";
  const needsNote = row ? overtimeNoteRequired(row, approved) : false;
  const hasAction = canReview || canDecide || canReopen || canSubmit;
  const chosen = canReopen || canSubmit || approved !== null;
  const label = canReopen
    ? "سبب إعادة فتح الرفض"
    : canSubmit
      ? "سبب طلب مراجعة الزيادة"
      : approved === false
        ? "سبب الرفض"
        : canReview
          ? "مبرر احتساب الزيادة"
          : "سبب الاعتماد بعد إعادة فتح الرفض";
  const facts = row
    ? [
        ["اليوم والتاريخ", `${dayLabel(row.workDate)} ${row.workDate}`],
        ["الفترة الأصلية", clockRange(row.assignmentStart, row.assignmentEnd)],
        ["فترة الزيادة", clockRange(row.extraStart, row.extraEnd)],
        ["مدة الزيادة", durationLabel(row.minutes)],
        ["مركز تكلفة الزيادة", row.costCenterName ?? "غير محدد"],
        ["مشرف الفترة", row.supervisorName ?? "غير مسجل"],
      ]
    : [];
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {normalizeDigits(row?.name ?? "تفاصيل العمل الإضافي")}
            {row?.id ? ` · طلب #${row.id}` : " · زيادة فعلية مرصودة"}
          </DialogTitle>
          <DialogDescription>
            كل زيادة تخص فترة ومركز تكلفة محددين. قبول المشرف مبدئي، والاعتماد
            النهائي من الشؤون الإدارية.
          </DialogDescription>
        </DialogHeader>
        {row && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {row.kind === "planned" ? "زيادة مخططة" : "زيادة فعلية"}
              </Badge>
              <Badge variant="secondary">{statusLabel(row)}</Badge>
              <span className="text-xs text-muted-foreground">
                الرقم الوظيفي: <bdi>{normalizeDigits(row.employeeId)}</bdi>
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-lg border p-4 text-sm">
                  {facts.map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="min-w-0 break-words">
                        <bdi>{normalizeDigits(value)}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
                {(row.reviewNote || row.reason) && (
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">
                      {row.reviewStatus === "pending"
                        ? "السبب المسجل للطلب"
                        : "سبب قرار المشرف"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {normalizeDigits(row.reviewNote ?? row.reason ?? "")}
                    </p>
                  </div>
                )}
                {row.decisionNote && (
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">سبب قرار الشؤون الإدارية</p>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {normalizeDigits(row.decisionNote)}
                    </p>
                  </div>
                )}
                {hasAction ? (
                  <form
                    className="space-y-4 rounded-lg border bg-secondary/30 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!chosen || (needsNote && note.trim().length < 3))
                        return;
                      onDecide(row, {
                        kind,
                        approved: canReopen || canSubmit ? false : approved!,
                        note: note.trim(),
                      });
                    }}
                  >
                    <h3 className="text-sm font-semibold">
                      {canReopen
                        ? "تدخل الأدمن"
                        : canSubmit
                          ? "إرسال الزيادة لمراجعة المشرف"
                          : canReview
                            ? "مراجعة المشرف"
                            : row.reopened
                              ? "إعادة قرار الشؤون الإدارية"
                              : "قرار الشؤون الإدارية"}
                    </h3>
                    {!canReopen && !canSubmit && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          variant={approved === true ? "default" : "outline"}
                          aria-pressed={approved === true}
                          onClick={() => setApproved(true)}
                        >
                          {canReview ? "قبول مبدئي" : "اعتماد نهائي"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          variant={
                            approved === false ? "destructive" : "outline"
                          }
                          aria-pressed={approved === false}
                          onClick={() => setApproved(false)}
                        >
                          {canReview ? "رفض الزيادة" : "رفض نهائي"}
                        </Button>
                      </div>
                    )}
                    {chosen && needsNote && (
                      <div className="space-y-2">
                        <Label htmlFor="overtime-decision-note">
                          {label} (إلزامي)
                        </Label>
                        <Textarea
                          id="overtime-decision-note"
                          disabled={busy}
                          required
                          minLength={3}
                          maxLength={2000}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="اكتب سببًا واضحًا من 3 أحرف على الأقل"
                        />
                      </div>
                    )}
                    {chosen && !needsNote && (
                      <p className="text-xs text-muted-foreground">
                        هذا اعتماد أول للشؤون الإدارية؛ لا يلزم كتابة سبب.
                      </p>
                    )}
                    {canReopen && (
                      <p className="text-xs text-muted-foreground">
                        يعود الطلب إلى الشؤون الإدارية، وتبقى أسباب الرفض
                        والقرارات السابقة محفوظة.
                      </p>
                    )}
                    {canDecide && row.requiresApprovalReason && (
                      <p className="text-xs text-muted-foreground">
                        أعيد فتح رفض سابق؛ يلزم توضيح سبب القرار الجديد، سواء
                        بالاعتماد أو الرفض.
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        busy || !chosen || (needsNote && note.trim().length < 3)
                      }
                    >
                      {busy
                        ? "جارٍ الحفظ…"
                        : !chosen
                          ? "اختر القرار أولًا"
                          : canReopen
                            ? "إعادة الفتح وإرجاعه للشؤون الإدارية"
                            : canSubmit
                              ? "إرسال لمراجعة المشرف"
                              : canReview && approved
                                ? "تأكيد القبول والإرسال للشؤون الإدارية"
                                : approved
                                  ? "تأكيد الاعتماد النهائي"
                                  : "تأكيد الرفض"}
                    </Button>
                  </form>
                ) : (
                  <p className="rounded-lg border bg-secondary/30 p-4 text-sm text-muted-foreground">
                    {row.status === "pending" && row.reviewStatus === "pending"
                      ? "بانتظار مراجعة مشرف الفترة. لا يمكن الاعتماد النهائي قبل القبول المبدئي."
                      : row.status === "pending"
                        ? "الطلب لدى الشؤون الإدارية لاتخاذ القرار النهائي."
                        : "يمكنك الاطلاع على القرار وأسبابه وسجل إجراءاته حسب صلاحيتك."}
                  </p>
                )}
              </div>
              <section aria-label="سجل القرارات والإجراءات">
                <h3 className="mb-4 font-semibold">سجل القرارات والإجراءات</h3>
                {!row.history.length ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    تجاوز مرصود من الحضور والانصراف؛ لم يسجل المشرف قراره بعد.
                  </p>
                ) : (
                  <ol className="space-y-5 border-r pr-4">
                    {[...row.history].reverse().map((event) => (
                      <li key={event.id} className="relative text-sm">
                        <span className="absolute -right-[21px] top-2 h-2 w-2 rounded-full bg-primary" />
                        <p className="font-medium">{historyTitle(event)}</p>
                        {event.reason && (
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {normalizeDigits(event.reason)}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {normalizeDigits(
                            event.actorName ?? "مستخدم غير مسجل",
                          )}{" "}
                          ·{" "}
                          <bdi>
                            {formatDateTime(
                              event.createdAt,
                              {
                                timeZone: "Asia/Riyadh",
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              },
                              "ar-SA-u-ca-gregory",
                            )}
                          </bdi>
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
