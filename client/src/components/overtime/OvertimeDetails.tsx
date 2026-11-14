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
import { useLanguage, type Language } from "@/lib/i18n";
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

function historyTitle(event: OvertimeHistory, language: Language) {
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  if (event.action === "reopen" || event.stage === "admin_reopen")
    return text("إعادة فتح الرفض وإرجاعه للشؤون الإدارية", "Reopen rejection and return to administration", "مسترد فیصلہ دوبارہ کھول کر انتظامیہ کو واپس بھیجا گیا");
  if (event.stage === "supervisor")
    return event.approved ? text("قبول المشرف المبدئي", "Supervisor’s initial acceptance", "سپروائزر کی ابتدائی منظوری") : text("رفض المشرف", "Rejected by supervisor", "سپروائزر نے مسترد کیا");
  if (event.stage === "hr_final")
    return event.approved
      ? text("اعتماد الشؤون الإدارية النهائي", "Final administrative approval", "انتظامیہ کی حتمی منظوری")
      : text("رفض الشؤون الإدارية", "Rejected by administration", "انتظامیہ نے مسترد کیا");
  return event.action === "create"
    ? event.approved === true
      ? text("تسجيل الزيادة وقبولها مبدئيًا", "Overtime recorded and initially accepted", "اضافی وقت درج اور ابتدائی طور پر منظور")
      : event.approved === false
        ? text("تسجيل الزيادة ورفضها من المشرف", "Overtime recorded and rejected by supervisor", "اضافی وقت درج اور سپروائزر نے مسترد کیا")
        : text("تقديم طلب زيادة لمراجعة المشرف", "Overtime submitted for supervisor review", "اضافی وقت سپروائزر کے جائزے کے لیے بھیجا گیا")
    : text("تحديث الطلب", "Request updated", "درخواست میں تبدیلی");
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
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
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
    ? text("سبب إعادة فتح الرفض", "Reason for reopening the rejection", "مسترد فیصلہ دوبارہ کھولنے کی وجہ")
    : canSubmit
      ? text("سبب طلب مراجعة الزيادة", "Reason for requesting overtime review", "اضافی وقت کے جائزے کی وجہ")
      : approved === false
        ? text("سبب الرفض", "Reason for rejection", "مسترد کرنے کی وجہ")
        : canReview
          ? text("مبرر احتساب الزيادة", "Reason for counting overtime", "اضافی وقت شمار کرنے کی وجہ")
          : text("سبب الاعتماد بعد إعادة فتح الرفض", "Reason for approval after reopening", "دوبارہ کھولنے کے بعد منظوری کی وجہ");
  const facts = row
    ? [
        [text("اليوم والتاريخ", "Day and date", "دن اور تاریخ"), `${dayLabel(row.workDate, language)} ${row.workDate}`],
        [text("الفترة الأصلية", "Original shift", "اصل شفٹ"), clockRange(row.assignmentStart, row.assignmentEnd)],
        [text("فترة الزيادة", "Overtime period", "اضافی وقت کی مدت"), clockRange(row.extraStart, row.extraEnd)],
        [text("مدة الزيادة", "Overtime duration", "اضافی وقت کا دورانیہ"), durationLabel(row.minutes, language)],
        [text("مركز تكلفة الزيادة", "Overtime cost center", "اضافی وقت کا لاگت مرکز"), row.costCenterName ?? text("غير محدد", "Not set", "مقرر نہیں")],
        [text("مشرف الفترة", "Shift supervisor", "شفٹ سپروائزر"), row.supervisorName ?? text("غير مسجل", "Not recorded", "درج نہیں")],
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
        dir={language === "en" ? "ltr" : "rtl"}
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
            {normalizeDigits(row?.name ?? text("تفاصيل العمل الإضافي", "Overtime details", "اضافی وقت کی تفصیلات"))}
            {row?.id ? text(` · طلب #${row.id}`, ` · Request #${row.id}`, ` · درخواست #${row.id}`) : text(" · زيادة فعلية مرصودة", " · Recorded actual overtime", " · درج شدہ حقیقی اضافی وقت")}
          </DialogTitle>
          <DialogDescription>
            {text("كل زيادة تخص فترة ومركز تكلفة محددين. قبول المشرف مبدئي، والاعتماد النهائي من الشؤون الإدارية.", "Each overtime entry belongs to a specific shift and cost center. Supervisor acceptance is preliminary; administration makes the final decision.", "ہر اضافی وقت ایک مخصوص شفٹ اور لاگت مرکز سے متعلق ہے۔ سپروائزر کی منظوری ابتدائی ہے؛ حتمی فیصلہ انتظامیہ کرتی ہے۔")}
          </DialogDescription>
        </DialogHeader>
        {row && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {row.kind === "planned" ? text("زيادة مخططة", "Planned overtime", "منصوبہ بند اضافی وقت") : text("زيادة فعلية", "Actual overtime", "حقیقی اضافی وقت")}
              </Badge>
              <Badge variant="secondary">{statusLabel(row, language)}</Badge>
              <span className="text-xs text-muted-foreground">
                {text("الرقم الوظيفي", "Employee ID", "ملازم نمبر")}: <bdi>{normalizeDigits(row.employeeId)}</bdi>
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
                        ? text("السبب المسجل للطلب", "Recorded request reason", "درخواست کی درج شدہ وجہ")
                        : text("سبب قرار المشرف", "Reason for supervisor’s decision", "سپروائزر کے فیصلے کی وجہ")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {normalizeDigits(row.reviewNote ?? row.reason ?? "")}
                    </p>
                  </div>
                )}
                {row.decisionNote && (
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">{text("سبب قرار الشؤون الإدارية", "Reason for administrative decision", "انتظامیہ کے فیصلے کی وجہ")}</p>
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
                        ? text("تدخل الأدمن", "Administrator intervention", "ایڈمن کی مداخلت")
                        : canSubmit
                          ? text("إرسال الزيادة لمراجعة المشرف", "Submit overtime for supervisor review", "اضافی وقت سپروائزر کے جائزے کے لیے بھیجیں")
                          : canReview
                            ? text("مراجعة المشرف", "Supervisor review", "سپروائزر کا جائزہ")
                            : row.reopened
                              ? text("إعادة قرار الشؤون الإدارية", "New administrative decision", "انتظامیہ کا نیا فیصلہ")
                              : text("قرار الشؤون الإدارية", "Administrative decision", "انتظامیہ کا فیصلہ")}
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
                          {canReview ? text("قبول مبدئي", "Initial acceptance", "ابتدائی منظوری") : text("اعتماد نهائي", "Final approval", "حتمی منظوری")}
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
                          {canReview ? text("رفض الزيادة", "Reject overtime", "اضافی وقت مسترد کریں") : text("رفض نهائي", "Final rejection", "حتمی انکار")}
                        </Button>
                      </div>
                    )}
                    {chosen && needsNote && (
                      <div className="space-y-2">
                        <Label htmlFor="overtime-decision-note">
                          {label} {text("(إلزامي)", "(required)", "(لازمی)")}
                        </Label>
                        <Textarea
                          id="overtime-decision-note"
                          disabled={busy}
                          required
                          minLength={3}
                          maxLength={2000}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder={text("اكتب سببًا واضحًا من 3 أحرف على الأقل", "Enter a clear reason of at least 3 characters", "کم از کم 3 حروف کی واضح وجہ درج کریں")}
                        />
                      </div>
                    )}
                    {chosen && !needsNote && (
                      <p className="text-xs text-muted-foreground">
                        {text("هذا اعتماد أول للشؤون الإدارية؛ لا يلزم كتابة سبب.", "This is the first administrative approval; no reason is required.", "یہ انتظامیہ کی پہلی منظوری ہے؛ وجہ درکار نہیں۔")}
                      </p>
                    )}
                    {canReopen && (
                      <p className="text-xs text-muted-foreground">
                        {text("يعود الطلب إلى الشؤون الإدارية، وتبقى أسباب الرفض والقرارات السابقة محفوظة.", "The request returns to administration; previous rejection reasons and decisions remain saved.", "درخواست انتظامیہ کو واپس جائے گی؛ پچھلے فیصلے اور انکار کی وجوہات محفوظ رہیں گی۔")}
                      </p>
                    )}
                    {canDecide && row.requiresApprovalReason && (
                      <p className="text-xs text-muted-foreground">
                        {text("أعيد فتح رفض سابق؛ يلزم توضيح سبب القرار الجديد، سواء بالاعتماد أو الرفض.", "A previous rejection was reopened; a reason is required for either approval or rejection.", "پچھلا انکار دوبارہ کھولا گیا؛ منظوری یا انکار دونوں کے لیے وجہ لازم ہے۔")}
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        busy || !chosen || (needsNote && note.trim().length < 3)
                      }
                    >
                      {busy
                        ? text("جارٍ الحفظ…", "Saving…", "محفوظ ہو رہا ہے…")
                        : !chosen
                          ? text("اختر القرار أولًا", "Choose a decision first", "پہلے فیصلہ منتخب کریں")
                          : canReopen
                            ? text("إعادة الفتح وإرجاعه للشؤون الإدارية", "Reopen and return to administration", "دوبارہ کھول کر انتظامیہ کو واپس بھیجیں")
                            : canSubmit
                              ? text("إرسال لمراجعة المشرف", "Submit for supervisor review", "سپروائزر کے جائزے کے لیے بھیجیں")
                              : canReview && approved
                                ? text("تأكيد القبول والإرسال للشؤون الإدارية", "Confirm acceptance and send to administration", "منظوری کی تصدیق کر کے انتظامیہ کو بھیجیں")
                                : approved
                                  ? text("تأكيد الاعتماد النهائي", "Confirm final approval", "حتمی منظوری کی تصدیق")
                                  : text("تأكيد الرفض", "Confirm rejection", "انکار کی تصدیق")}
                    </Button>
                  </form>
                ) : (
                  <p className="rounded-lg border bg-secondary/30 p-4 text-sm text-muted-foreground">
                    {row.status === "pending" && row.reviewStatus === "pending"
                      ? text("بانتظار مراجعة مشرف الفترة. لا يمكن الاعتماد النهائي قبل القبول المبدئي.", "Awaiting supervisor review. Final approval requires initial acceptance.", "سپروائزر کے جائزے کا انتظار ہے۔ حتمی منظوری سے پہلے ابتدائی منظوری ضروری ہے۔")
                      : row.status === "pending"
                        ? text("الطلب لدى الشؤون الإدارية لاتخاذ القرار النهائي.", "The request is with administration for a final decision.", "درخواست حتمی فیصلے کے لیے انتظامیہ کے پاس ہے۔")
                        : text("يمكنك الاطلاع على القرار وأسبابه وسجل إجراءاته حسب صلاحيتك.", "You may view the decision, reasons and history according to your permissions.", "آپ اپنی اجازت کے مطابق فیصلہ، وجوہات اور سابقہ کارروائیاں دیکھ سکتے ہیں۔")}
                  </p>
                )}
              </div>
              <section aria-label={text("سجل القرارات والإجراءات", "Decision and action history", "فیصلوں اور کارروائیوں کا ریکارڈ")}>
                <h3 className="mb-4 font-semibold">{text("سجل القرارات والإجراءات", "Decision and action history", "فیصلوں اور کارروائیوں کا ریکارڈ")}</h3>
                {!row.history.length ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {text("تجاوز مرصود من الحضور والانصراف؛ لم يسجل المشرف قراره بعد.", "An attendance overrun was detected; the supervisor has not recorded a decision yet.", "حاضری میں اضافی وقت پایا گیا؛ سپروائزر نے ابھی فیصلہ درج نہیں کیا۔")}
                  </p>
                ) : (
                  <ol className="space-y-5 border-r pr-4">
                    {[...row.history].reverse().map((event) => (
                      <li key={event.id} className="relative text-sm">
                        <span className="absolute -right-[21px] top-2 h-2 w-2 rounded-full bg-primary" />
                        <p className="font-medium">{historyTitle(event, language)}</p>
                        {event.reason && (
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {normalizeDigits(event.reason)}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {normalizeDigits(
                            event.actorName ?? text("مستخدم غير مسجل", "Unknown user", "نامعلوم صارف"),
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
