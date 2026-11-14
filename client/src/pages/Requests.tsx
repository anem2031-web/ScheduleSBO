import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { riyadhDateKey, riyadhTime } from "@/lib/operational-date";
import { normalizeDigits } from "@shared/display-format";
import { permits } from "@shared/access-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { WorkerAbsences } from "@/components/leaves/WorkerAbsences";
import { WorkerOvertime } from "@/components/overtime/WorkerOvertime";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

const copy = {
  ar: { title: "المراجعات والاعتمادات", description: "الإجازات والاستئذان وتصحيح الحضور، حسب صلاحيات حسابك. طلبات العمل الإضافي لها صفحة مستقلة.", refresh: "تحديث", forbidden: "هذه الصفحة غير متاحة لصلاحيات حسابك.", corrections: "تصحيحات الحضور", loading: "جارٍ تحميل التصحيحات…", empty: "لا توجد تصحيحات معلقة.", checkIn: "الحضور", checkOut: "الانصراف", reason: "السبب", approve: "اعتماد التصحيح", reject: "رفض التصحيح", approved: "تم اعتماد التصحيح", rejected: "تم رفض التصحيح", approveTitle: "اعتماد تصحيح الحضور", rejectTitle: "رفض تصحيح الحضور", approveDesc: "يُطبق التصحيح ويحفظ قرارك في سجل المراجعة مع القيم الأصلية.", rejectDesc: "اكتب سبب رفض التصحيح.", notes: "ملاحظات (اختياري)", rejection: "سبب الرفض", back: "رجوع", saving: "جارٍ الحفظ…", confirm: "تأكيد القرار" },
  en: { title: "Reviews and approvals", description: "Leave, permissions and attendance corrections according to your access. Overtime requests have a separate page.", refresh: "Refresh", forbidden: "You do not have access to this page.", corrections: "Attendance corrections", loading: "Loading corrections…", empty: "No pending corrections.", checkIn: "Check-in", checkOut: "Check-out", reason: "Reason", approve: "Approve correction", reject: "Reject correction", approved: "Correction approved", rejected: "Correction rejected", approveTitle: "Approve attendance correction", rejectTitle: "Reject attendance correction", approveDesc: "The correction is applied and your decision is saved with the original values.", rejectDesc: "Enter the reason for rejection.", notes: "Notes (optional)", rejection: "Rejection reason", back: "Back", saving: "Saving…", confirm: "Confirm decision" },
  ur: { title: "جائزے اور منظوری", description: "آپ کی اجازتوں کے مطابق چھٹیاں، اجازت اور حاضری کی درستگی۔ اضافی کام کی درخواستوں کا الگ صفحہ ہے۔", refresh: "تازہ کریں", forbidden: "آپ کو اس صفحے تک رسائی حاصل نہیں ہے۔", corrections: "حاضری کی درستگیاں", loading: "درستگیاں لوڈ ہو رہی ہیں…", empty: "کوئی درستگی زیر التوا نہیں۔", checkIn: "آمد", checkOut: "روانگی", reason: "وجہ", approve: "درستگی منظور کریں", reject: "درستگی مسترد کریں", approved: "درستگی منظور ہو گئی", rejected: "درستگی مسترد ہو گئی", approveTitle: "حاضری کی درستگی منظور کریں", rejectTitle: "حاضری کی درستگی مسترد کریں", approveDesc: "درستگی لاگو ہوگی اور آپ کا فیصلہ اصل اوقات کے ساتھ محفوظ ہوگا۔", rejectDesc: "مسترد کرنے کی وجہ درج کریں۔", notes: "نوٹس (اختیاری)", rejection: "مسترد کرنے کی وجہ", back: "واپس", saving: "محفوظ ہو رہا ہے…", confirm: "فیصلے کی تصدیق کریں" },
} as const;

export default function Requests() {
  const { language } = useLanguage();
  const text = copy[language];
  const direction = language === "en" ? "ltr" : "rtl";
  const { user } = useAuth();
  const [review, setReview] = useState<{ id: number; approved: boolean } | null>(null);
  const [notes, setNotes] = useState("");
  const permissions = user?.permissions ?? [];
  const canReadCorrections = permits(permissions, "attendance:read") || permits(permissions, "attendance:approve");
  const allowed = canReadCorrections || permits(permissions, "leave:read") || permits(permissions, "overtime:read");
  const utils = trpc.useUtils();
  const query = trpc.operations.reviewQueue.useQuery({ month: riyadhDateKey().slice(0, 7) }, { enabled: canReadCorrections });
  const mutation = trpc.attendance.approveCorrection.useMutation({
    onSuccess: async () => {
      toast.success(review?.approved ? text.approved : text.rejected);
      setReview(null); setNotes("");
      await Promise.all([utils.operations.invalidate(), utils.attendance.invalidate(), utils.schedules.invalidate(), utils.overtime.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  return <DashboardLayout><div dir={direction} className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{text.title}</h1><p className="mt-2 text-sm text-muted-foreground">{text.description}</p></div>{allowed && <Button variant="outline" onClick={() => { void Promise.all([utils.leaves.invalidate(), utils.overtime.invalidate(), utils.operations.invalidate()]); }}>{text.refresh}</Button>}</div>
    {!allowed ? <p className="rounded-xl border p-6 text-sm">{text.forbidden}</p> : <>
      <WorkerAbsences />
      <WorkerOvertime />
      {canReadCorrections && <Card><CardHeader><CardTitle>{text.corrections}</CardTitle></CardHeader><CardContent className="space-y-3">
        {query.isLoading ? <p className="text-sm">{text.loading}</p> : query.isError ? <p role="alert" className="text-sm text-destructive">{normalizeDigits(query.error.message)}</p> : query.data?.corrections.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">{text.empty}</p> : query.data?.corrections.map((row) => <div key={row.id} className="space-y-3 rounded-lg border p-4">
          <p className="font-semibold">{normalizeDigits(row.name)} · {normalizeDigits(row.employeeId)}</p><p className="text-xs text-muted-foreground">{riyadhDateKey(row.attendanceDate)}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2"><p>{text.checkIn}: {riyadhTime(row.originalCheckIn)} ← {riyadhTime(row.correctedCheckIn ?? row.originalCheckIn)}</p><p>{text.checkOut}: {riyadhTime(row.originalCheckOut)} ← {riyadhTime(row.correctedCheckOut ?? row.originalCheckOut)}</p></div><p className="whitespace-pre-wrap text-sm text-muted-foreground">{text.reason}: {normalizeDigits(row.reason)}</p>
          {query.data.canApproveCorrections && <div className="flex gap-2"><Button size="sm" onClick={() => { setReview({ id: row.id, approved: true }); setNotes(""); }}>{text.approve}</Button><Button variant="outline" size="sm" onClick={() => { setReview({ id: row.id, approved: false }); setNotes(""); }}>{text.reject}</Button></div>}
        </div>)}
      </CardContent></Card>}
    </>}
    <Dialog open={review !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setReview(null); }}><DialogContent dir={direction}><DialogHeader><DialogTitle>{review?.approved ? text.approveTitle : text.rejectTitle}</DialogTitle><DialogDescription>{review?.approved ? text.approveDesc : text.rejectDesc}</DialogDescription></DialogHeader><Label htmlFor="correction-notes">{review?.approved ? text.notes : text.rejection}</Label><Textarea id="correction-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /><DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setReview(null)}>{text.back}</Button><Button disabled={mutation.isPending || (!review?.approved && notes.trim().length < 3)} onClick={() => { if (review) mutation.mutate({ correctionId: review.id, approved: review.approved, notes: notes.trim() || undefined }); }}>{mutation.isPending ? text.saving : text.confirm}</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}
