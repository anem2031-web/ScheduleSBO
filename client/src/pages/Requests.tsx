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

export default function Requests() {
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
      toast.success(review?.approved ? "تم اعتماد التصحيح" : "تم رفض التصحيح");
      setReview(null); setNotes("");
      await Promise.all([utils.operations.invalidate(), utils.attendance.invalidate(), utils.schedules.invalidate(), utils.overtime.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  return <DashboardLayout><div dir="rtl" className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">المراجعات والاعتمادات</h1><p className="mt-2 text-sm text-muted-foreground">الإجازات والاستئذان وتصحيح الحضور، حسب صلاحيات حسابك. طلبات العمل الإضافي لها صفحة مستقلة.</p></div>{allowed && <Button variant="outline" onClick={() => { void Promise.all([utils.leaves.invalidate(), utils.overtime.invalidate(), utils.operations.invalidate()]); }}>تحديث</Button>}</div>
    {!allowed ? <p className="rounded-xl border p-6 text-sm">هذه الصفحة غير متاحة لصلاحيات حسابك.</p> : <>
      <WorkerAbsences />
      <WorkerOvertime />
      {canReadCorrections && <Card><CardHeader><CardTitle>تصحيحات الحضور</CardTitle></CardHeader><CardContent className="space-y-3">
        {query.isLoading ? <p className="text-sm">جارٍ تحميل التصحيحات…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">{normalizeDigits(query.error.message)}</p> : query.data?.corrections.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">لا توجد تصحيحات معلقة.</p> : query.data?.corrections.map((row) => <div key={row.id} className="space-y-3 rounded-lg border p-4">
          <p className="font-semibold">{normalizeDigits(row.name)} · {normalizeDigits(row.employeeId)}</p><p className="text-xs text-muted-foreground">{riyadhDateKey(row.attendanceDate)}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2"><p>الحضور: {riyadhTime(row.originalCheckIn)} ← {riyadhTime(row.correctedCheckIn ?? row.originalCheckIn)}</p><p>الانصراف: {riyadhTime(row.originalCheckOut)} ← {riyadhTime(row.correctedCheckOut ?? row.originalCheckOut)}</p></div><p className="whitespace-pre-wrap text-sm text-muted-foreground">السبب: {normalizeDigits(row.reason)}</p>
          {query.data.canApproveCorrections && <div className="flex gap-2"><Button size="sm" onClick={() => { setReview({ id: row.id, approved: true }); setNotes(""); }}>اعتماد التصحيح</Button><Button variant="outline" size="sm" onClick={() => { setReview({ id: row.id, approved: false }); setNotes(""); }}>رفض التصحيح</Button></div>}
        </div>)}
      </CardContent></Card>}
    </>}
    <Dialog open={review !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setReview(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{review?.approved ? "اعتماد تصحيح الحضور" : "رفض تصحيح الحضور"}</DialogTitle><DialogDescription>{review?.approved ? "يُطبق التصحيح ويحفظ قرارك في سجل المراجعة مع القيم الأصلية." : "اكتب سبب رفض التصحيح."}</DialogDescription></DialogHeader><Label htmlFor="correction-notes">{review?.approved ? "ملاحظات (اختياري)" : "سبب الرفض"}</Label><Textarea id="correction-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /><DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setReview(null)}>رجوع</Button><Button disabled={mutation.isPending || (!review?.approved && notes.trim().length < 3)} onClick={() => { if (review) mutation.mutate({ correctionId: review.id, approved: review.approved, notes: notes.trim() || undefined }); }}>{mutation.isPending ? "جارٍ الحفظ…" : "تأكيد القرار"}</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}
