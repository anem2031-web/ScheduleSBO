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

/** Archive through the existing worker lifecycle; payroll and attendance history remain intact. */
export function WorkerArchiveAction({
  worker,
  onCompleted,
  variant = "ghost",
}: {
  worker: { id: number; nameAr: string; status: string };
  onCompleted?: (restored: boolean) => void;
  variant?: "ghost" | "outline";
}) {
  const { user } = useAuth();
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
        ? "تمت استعادة العامل إلى القائمة النشطة"
        : "تم حذف العامل من القائمة النشطة مع الاحتفاظ بسجلاته",
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
        aria-label={`${restoring ? "استعادة" : "حذف"} العامل ${normalizeDigits(worker.nameAr)}`}
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
        {restoring ? "استعادة" : "حذف"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {restoring ? "استعادة العامل" : "حذف العامل من القائمة النشطة"}
            </DialogTitle>
            <DialogDescription className="leading-7">
              {restoring
                ? `ستعيد «${normalizeDigits(worker.nameAr)}» إلى قائمة العمال النشطين مع بقاء بياناته وسجلاته السابقة.`
                : `سيُحذف «${normalizeDigits(worker.nameAr)}» من قائمة العمال النشطين وتُؤرشف بطاقته بصفة منتهي الخدمة. تبقى سجلات الحضور والجداول والرواتب محفوظة. يمكنك عرضه واستعادته باختيار «إظهار المؤرشفين وغير النشطين».`}
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
                {restoring ? "سبب الاستعادة" : "سبب الحذف والأرشفة"}
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
                  اكتب سببًا واضحًا من 3 أحرف على الأقل.
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
                إلغاء
              </Button>
              <Button
                type="submit"
                variant={restoring ? "default" : "destructive"}
                disabled={pending}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending
                  ? "جارٍ الحفظ…"
                  : restoring
                    ? "تأكيد الاستعادة"
                    : "تأكيد الحذف والأرشفة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
