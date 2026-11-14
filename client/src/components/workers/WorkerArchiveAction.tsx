import { useState } from "react";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDigits } from "@shared/display-format";
import { permits } from "@shared/access-control";
import { useLanguage } from "@/lib/i18n";
import { localizedName } from "@/lib/localized-data";

/** Archive through the existing worker lifecycle; payroll and attendance history remain intact. */
export function WorkerArchiveAction({
  worker,
  onCompleted,
  variant = "ghost",
}: {
  worker: { id: number; nameAr: string; nameEn?: string | null; nameUr?: string | null; status: string };
  onCompleted?: (restored: boolean) => void;
  variant?: "ghost" | "outline";
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const displayName = localizedName(worker, language);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const restoring = worker.status === "terminated";
  const allowed = permits(user?.permissions ?? [], restoring ? "workers:update" : "workers:delete");
  const completed = async (restored: boolean) => {
    setOpen(false);
    setReason("");
    setSubmitted(false);
    toast.success(
      restored
        ? text("تمت استعادة العامل إلى القائمة النشطة", "Worker restored to the active list", "کارکن فعال فہرست میں بحال ہو گیا")
        : text("تم حذف العامل من القائمة النشطة مع الاحتفاظ بسجلاته", "Worker removed from the active list; records retained", "کارکن فعال فہرست سے ہٹا دیا گیا؛ ریکارڈ محفوظ ہے"),
    );
    onCompleted?.(restored);
    await Promise.allSettled([
      utils.workers.list.invalidate(),
      utils.workers.getById.invalidate({ id: worker.id }),
      utils.workers.referenceData.invalidate(),
      utils.workers.listAll.invalidate(),
      utils.schedules.getWeeklyBoard.invalidate(),
      utils.operations.dailyOverview.invalidate(),
    ]);
  };
  const archive = trpc.workers.delete.useMutation({
    onSuccess: () => completed(false),
    onError: (error) => toast.error(normalizeDigits(error.message)),
  });
  const restore = trpc.workers.changeStatus.useMutation({
    onSuccess: () => completed(true),
    onError: (error) => toast.error(normalizeDigits(error.message)),
  });
  const pending = archive.isPending || restore.isPending;
  if (!allowed) return null;
  const invalid = reason.trim().length < 3;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={
          restoring
            ? "gap-1.5"
            : "gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        }
        aria-label={`${restoring ? text("استعادة العامل", "Restore worker", "کارکن بحال کریں") : text("حذف العامل", "Remove worker", "کارکن ہٹائیں")} ${normalizeDigits(displayName)}`}
        onClick={() => {
          setOpen(true);
          setReason("");
          setSubmitted(false);
        }}
      >
        {restoring ? (
          <RotateCcw className="h-4 w-4" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {restoring ? text("استعادة", "Restore", "بحال کریں") : text("حذف", "Remove", "ہٹائیں")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogContent dir={language === "en" ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>
              {restoring ? text("استعادة العامل", "Restore worker", "کارکن بحال کریں") : text("حذف العامل من القائمة النشطة", "Remove worker from active list", "کارکن کو فعال فہرست سے ہٹائیں")}
            </DialogTitle>
            <DialogDescription className="leading-7">
              {restoring
                ? text(`ستعيد «${normalizeDigits(displayName)}» إلى قائمة العمال النشطين مع بقاء بياناته وسجلاته السابقة.`, `Restore ${normalizeDigits(displayName)} to the active worker list while retaining their previous records.`, `${normalizeDigits(displayName)} کو سابقہ ریکارڈ برقرار رکھتے ہوئے فعال کارکنوں کی فہرست میں بحال کریں۔`)
                : text(`سيُحذف «${normalizeDigits(displayName)}» من قائمة العمال النشطين وتُؤرشف بطاقته بصفة منتهي الخدمة. تبقى سجلات الحضور والجداول والرواتب محفوظة. يمكنك عرضه واستعادته باختيار «إظهار المؤرشفين وغير النشطين».`, `${normalizeDigits(displayName)} will be removed from the active list and archived as employment ended. Attendance, schedules and payroll records remain. Select “Show archived and inactive workers” to view or restore.`, `${normalizeDigits(displayName)} فعال فہرست سے ہٹا کر ملازمت ختم کے طور پر محفوظ کیا جائے گا۔ حاضری، شیڈول اور تنخواہ کا ریکارڈ برقرار رہے گا۔ دیکھنے یا بحال کرنے کے لیے محفوظ شدہ اور غیر فعال کارکن دکھائیں منتخب کریں۔`)}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (invalid || pending) return;
              if (restoring)
                restore.mutate({
                  id: worker.id,
                  status: "active",
                  reason: reason.trim(),
                });
              else archive.mutate({ id: worker.id, reason: reason.trim() });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor={`worker-action-reason-${worker.id}`}>
                {restoring ? text("سبب الاستعادة", "Reason for restoring", "بحالی کی وجہ") : text("سبب الحذف والأرشفة", "Reason for removal and archiving", "ہٹانے اور محفوظ کرنے کی وجہ")}
              </Label>
              <Textarea
                id={`worker-action-reason-${worker.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                disabled={pending}
                aria-invalid={submitted && invalid}
              />
              {submitted && invalid && (
                <p role="alert" className="text-sm text-destructive">
                  {text("اكتب سببًا واضحًا من 3 أحرف على الأقل.", "Enter a clear reason of at least 3 characters.", "کم از کم 3 حروف کی واضح وجہ درج کریں۔")}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {text("إلغاء", "Cancel", "منسوخ کریں")}
              </Button>
              <Button
                type="submit"
                variant={restoring ? "default" : "destructive"}
                disabled={pending}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending
                  ? text("جارٍ الحفظ…", "Saving…", "محفوظ ہو رہا ہے…")
                  : restoring
                    ? text("تأكيد الاستعادة", "Confirm restore", "بحالی کی تصدیق")
                    : text("تأكيد الحذف والأرشفة", "Confirm removal and archive", "ہٹانے اور محفوظ کرنے کی تصدیق")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
