import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { riyadhDateKey } from "@/lib/operational-date";
import { normalizeDigits } from "@shared/display-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const kinds = { sick: "إجازة مرضية", annual: "إجازة سنوية", permission: "استئذان أثناء الدوام" };
const statuses = { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" };
const selectStyle = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
type Form = { requestId?: number; leaveKind: "sick" | "annual" | "permission"; startDate: string; endDate: string; startTime: string; endTime: string; reason: string };
const initialForm = (): Form => ({ leaveKind: "sick", startDate: riyadhDateKey(), endDate: riyadhDateKey(), startTime: "08:00", endTime: "09:00", reason: "" });

export function WorkerAbsences({ workerId }: { workerId?: number }) {
  const { user } = useAuth();
  const permissions = (user as (typeof user & { permissions?: string[] }))?.permissions;
  const canRead = permissions ? permissions.some((p) => ["*", "leave:*", "leave:read"].includes(p)) : ["admin", "hr_admin", "supervisor", "modifier"].includes(user?.role ?? "");
  const [fromDate, setFromDate] = useState(() => `${riyadhDateKey().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(() => { const d = new Date(`${riyadhDateKey()}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 3); return d.toISOString().slice(0, 10); });
  const [form, setForm] = useState<Form | null>(null);
  const [decision, setDecision] = useState<{ id: number; action: "approve" | "reject" | "cancel"; kind: string } | null>(null);
  const [note, setNote] = useState("");
  const [permissionMode, setPermissionMode] = useState<"excused" | "make_up">("excused");
  const utils = trpc.useUtils();
  const query = trpc.leaves.list.useQuery({ workerId, fromDate, toDate }, { enabled: canRead && Boolean(fromDate && toDate && toDate >= fromDate) });
  const invalidate = async () => { await Promise.all([utils.leaves.invalidate(), utils.schedules.invalidate(), utils.operations.invalidate()]); };
  const saved = async () => { setForm(null); toast.success("تم حفظ الطلب وبانتظار اعتماد صاحب الصلاحية"); await invalidate(); };
  const create = trpc.leaves.create.useMutation({ onSuccess: saved, onError: (error) => toast.error(error.message) });
  const update = trpc.leaves.update.useMutation({ onSuccess: saved, onError: (error) => toast.error(error.message) });
  const decide = trpc.leaves.decide.useMutation({ onSuccess: async () => { setDecision(null); toast.success("تم تسجيل قرار المراجعة"); await invalidate(); }, onError: (error) => toast.error(error.message) });
  const cancel = trpc.leaves.cancel.useMutation({ onSuccess: async () => { setDecision(null); toast.success("تم إلغاء الطلب؛ راجع جدول العامل عند الحاجة لإعادة جدولة فتراته"); await invalidate(); }, onError: (error) => toast.error(error.message) });
  const saving = create.isPending || update.isPending;
  if (!canRead) return null;
  return <Card dir="rtl">
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>الإجازات والاستئذان</CardTitle>{workerId && query.data?.canCreate && <Button onClick={() => setForm(initialForm())}>طلب إجازة أو استئذان</Button>}</div>
      <CardDescription>المرضية والسنوية تُستبعدان من الساعات المطلوبة بعد الاعتماد. الاستئذان يُعتمد مع تحديد الإعفاء أو التعويض. البصمات الأصلية محفوظة.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="absence-from">عرض الطلبات من</Label><Input id="absence-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div><div><Label htmlFor="absence-to">إلى</Label><Input id="absence-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></div>
      {!workerId && <p className="text-sm text-muted-foreground">لتقديم طلب جديد افتح بطاقة العامل ثم قسم الإجازات والاستئذان.</p>}
      {toDate < fromDate && <p role="alert" className="text-sm text-destructive">تاريخ النهاية يسبق البداية.</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">{normalizeDigits(query.error.message)}</p>}
      {query.isLoading ? <p className="text-sm">جارٍ تحميل الطلبات…</p> : query.data?.items.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد طلبات في المدة المختارة.</p> : <div className="space-y-3">{query.data?.items.map((row) => <div key={row.id} className="space-y-3 rounded-lg border p-4" data-testid={`absence-request-${row.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{normalizeDigits(row.name)} · {normalizeDigits(row.employeeId)}</p><p className="mt-1 text-sm">{kinds[row.leaveKind as keyof typeof kinds]} · <bdi>{row.startDate} — {row.endDate}</bdi>{row.leaveKind === "permission" && <> · <bdi>{row.startTime} — {row.endTime}</bdi></>}</p></div><Badge variant="outline">{statuses[row.status]}</Badge></div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{normalizeDigits(row.reason)}</p>
        {row.permissionMode && <p className="text-sm">قرار الساعات: {row.permissionMode === "excused" ? "إعفاء من مدة الاستئذان" : "يلزم تعويض مدة الاستئذان"}</p>}
        {row.decisionNote && <p className="text-sm text-muted-foreground">ملاحظة القرار: {normalizeDigits(row.decisionNote)}</p>}
        <div className="flex flex-wrap gap-2">
          {workerId && row.status === "pending" && query.data.canCreate && (row.submittedBy === user?.id || query.data.canApprove) && <Button size="sm" variant="outline" onClick={() => setForm({ requestId: row.id, leaveKind: row.leaveKind as Form["leaveKind"], startDate: row.startDate, endDate: row.endDate, startTime: row.startTime ?? "08:00", endTime: row.endTime ?? "09:00", reason: row.reason })}>تعديل الطلب</Button>}
          {row.status === "pending" && query.data.canApprove && <><Button size="sm" onClick={() => { setNote(""); setPermissionMode("excused"); setDecision({ id: row.id, action: "approve", kind: row.leaveKind! }); }}>اعتماد الطلب</Button><Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ id: row.id, action: "reject", kind: row.leaveKind! }); }}>رفض الطلب</Button></>}
          {["pending", "approved"].includes(row.status) && (query.data.canCancel || (row.status === "pending" && row.submittedBy === user?.id && query.data.canCreate)) && <Button size="sm" variant="outline" onClick={() => { setNote(""); setDecision({ id: row.id, action: "cancel", kind: row.leaveKind! }); }}>إلغاء الطلب</Button>}
        </div>
      </div>)}</div>}
    </CardContent>
    <Dialog open={!!form} onOpenChange={(open) => { if (!open && !saving) setForm(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{form?.requestId ? "تعديل طلب معلق" : "طلب إجازة أو استئذان"}</DialogTitle><DialogDescription>يُحسب الاستئذان بحسب يوم العمل الذي يبدأ 04:30. الأوقات بعد منتصف الليل تتبع يوم بداية الدوام. الطلب لا يؤثر في الجدول قبل الاعتماد.</DialogDescription></DialogHeader>{form && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!workerId) return; const values = { ...form, workerId, endDate: form.leaveKind === "permission" ? form.startDate : form.endDate }; if (form.requestId) update.mutate({ ...values, requestId: form.requestId }); else create.mutate(values); }}>
      <div><Label htmlFor="absence-kind">نوع الطلب</Label><select id="absence-kind" className={selectStyle} value={form.leaveKind} onChange={(e) => setForm({ ...form, leaveKind: e.target.value as Form["leaveKind"] })}>{Object.entries(kinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="absence-start">{form.leaveKind === "permission" ? "تاريخ يوم العمل" : "أول يوم إجازة"}</Label><Input id="absence-start" required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>{form.leaveKind !== "permission" && <div><Label htmlFor="absence-end">آخر يوم إجازة</Label><Input id="absence-end" required min={form.startDate} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>}</div>
      {form.leaveKind === "permission" && <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="permission-start">بداية الاستئذان</Label><Input id="permission-start" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div><div><Label htmlFor="permission-end">نهاية الاستئذان</Label><Input id="permission-end" type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div></div>}
      <div><Label htmlFor="absence-reason">سبب الطلب</Label><Textarea id="absence-reason" required minLength={3} maxLength={2000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setForm(null)}>رجوع</Button><Button disabled={saving || form.reason.trim().length < 3}>{saving ? "جارٍ الحفظ…" : "حفظ الطلب"}</Button></DialogFooter>
    </form>}</DialogContent></Dialog>
    <Dialog open={!!decision} onOpenChange={(open) => { if (!open && !decide.isPending && !cancel.isPending) setDecision(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{decision?.action === "approve" ? "اعتماد الطلب" : decision?.action === "reject" ? "رفض الطلب" : "إلغاء الطلب"}</DialogTitle><DialogDescription>{decision?.action === "approve" ? "اعتماد الإجازة يلغي فترات العمل المخططة خلال أيامها مع حفظ تاريخها وإشعار المشرفين. الاستئذان يحفظ الفترة الأصلية ويعدل رصيد الساعات بحسب القرار." : "يُحفظ القرار وسببه في سجل الطلب. إلغاء إجازة معتمدة يتطلب مراجعة الجدول وإعادة توزيع العمل عند الحاجة."}</DialogDescription></DialogHeader>
      {decision?.action === "approve" && decision.kind === "permission" && <div><Label htmlFor="permission-mode">أثر الاستئذان على الساعات المطلوبة</Label><select id="permission-mode" className={selectStyle} value={permissionMode} onChange={(e) => setPermissionMode(e.target.value as typeof permissionMode)}><option value="excused">إعفاء من مدة الاستئذان</option><option value="make_up">يلزم تعويض مدة الاستئذان</option></select></div>}
      <Label htmlFor="absence-decision-note">{decision?.action === "approve" ? "ملاحظة القرار (اختياري)" : "سبب القرار"}</Label><Textarea id="absence-decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <DialogFooter><Button variant="outline" disabled={decide.isPending || cancel.isPending} onClick={() => setDecision(null)}>رجوع</Button><Button disabled={decide.isPending || cancel.isPending || (decision?.action !== "approve" && note.trim().length < 3)} onClick={() => { if (!decision) return; if (decision.action === "cancel") cancel.mutate({ requestId: decision.id, reason: note.trim() }); else decide.mutate({ requestId: decision.id, approved: decision.action === "approve", decisionNote: note.trim() || undefined, permissionMode: decision.kind === "permission" && decision.action === "approve" ? permissionMode : undefined }); }}>تأكيد القرار</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
