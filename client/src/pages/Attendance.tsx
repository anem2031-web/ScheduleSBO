import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Calendar, Clock, Upload, Loader2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { format } from "date-fns";
import { toast } from "sonner";
import { localizedName } from "@/lib/localized-data";

/**
 * صفحة الحضور والانصراف
 * تسجيل وإدارة حضور وانصراف العمال
 */
export default function Attendance() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [correctedCheckIn, setCorrectedCheckIn] = useState("");
  const [correctedCheckOut, setCorrectedCheckOut] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");


  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const workersQuery = trpc.workers.listAll.useQuery();
  const workers = workersQuery.data ?? [];

  // العامل المستهدف بالتسجيل: العامل المختار من القائمة إن وُجدت صلاحية اختيار،
  // وإلا المستخدم الحالي نفسه (مسار العامل الذي يسجّل حضوره الشخصي)
  const targetWorkerId = selectedWorkerId ? Number(selectedWorkerId) : user?.id;

  const checkInMutation = trpc.attendance.recordCheckIn.useMutation();
  const checkOutMutation = trpc.attendance.recordCheckOut.useMutation();
  const correctionMutation = trpc.attendance.correctAttendance.useMutation();
  const canApproveCorrections = user?.role === "admin" || user?.role === "hr_admin";
  const {
    data: pendingCorrections,
    refetch: refetchPendingCorrections,
    isLoading: isLoadingPendingCorrections,
  } = trpc.attendance.getPendingCorrections.useQuery(undefined, {
    enabled: canApproveCorrections,
  });

  const approveCorrectionMutation = trpc.attendance.approveCorrection.useMutation();

  // سجل العامل المختار لليوم المحدد.
  // استخدام getByDate هنا أدق من getDailyAttendance لأن الصفحة تعمل على عامل واحد
  // ويمنع الاعتماد على أول سجل في قائمة جميع العمال.
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);

  const { data: todayAttendance, refetch: refetchToday } = trpc.attendance.getByDate.useQuery(
    { workerId: targetWorkerId || 0, date: selectedDateObject },
    { enabled: !!targetWorkerId }
  );

  const handleCheckIn = async () => {
    if (!targetWorkerId) return;
    try {
      const result = await checkInMutation.mutateAsync({ workerId: targetWorkerId, checkInTime: new Date() });
      toast.success(
        result?.lateMinutes && result.lateMinutes > 0
          ? text(`تم تسجيل الحضور (متأخر ${result.lateMinutes} دقيقة)`, `Checked in (${result.lateMinutes} minutes late)`, `حاضری درج ہوئی (${result.lateMinutes} منٹ تاخیر)`)
          : text("تم تسجيل الحضور بنجاح", "Checked in successfully", "حاضری کامیابی سے درج ہو گئی")
      );
      refetchToday();
    } catch (error: any) {
      console.error("Check-in failed:", error);
      toast.error(error?.message || text("تعذّر تسجيل الحضور", "Could not record check-in", "حاضری درج نہیں ہو سکی"));
    }
  };

  const handleCheckOut = async () => {
    if (!targetWorkerId) return;
    try {
      const result = await checkOutMutation.mutateAsync({ workerId: targetWorkerId, checkOutTime: new Date() });
      toast.success(
        result?.overtimeMinutes && result.overtimeMinutes > 0
          ? text(`تم تسجيل الانصراف (عمل إضافي ${result.overtimeMinutes} دقيقة)`, `Checked out (${result.overtimeMinutes} minutes overtime)`, `روانگی درج ہوئی (${result.overtimeMinutes} منٹ اضافی)`)
          : text("تم تسجيل الانصراف بنجاح", "Checked out successfully", "روانگی کامیابی سے درج ہو گئی")
      );
      refetchToday();
    } catch (error: any) {
      console.error("Check-out failed:", error);
      toast.error(error?.message || text("تعذّر تسجيل الانصراف", "Could not record check-out", "روانگی درج نہیں ہو سکی"));
    }
  };

  const toDateTimeLocalValue = (value?: string | Date | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const openCorrectionDialog = (record: any) => {
    setEditingRecord(record);
    setCorrectedCheckIn(toDateTimeLocalValue(record.checkInTime));
    setCorrectedCheckOut(toDateTimeLocalValue(record.checkOutTime));
    setCorrectionReason("");
  };

  const closeCorrectionDialog = () => {
    if (correctionMutation.isPending) return;
    setEditingRecord(null);
    setCorrectedCheckIn("");
    setCorrectedCheckOut("");
    setCorrectionReason("");
  };

  const handleSubmitCorrection = async () => {
    if (!editingRecord) return;

    const reason = correctionReason.trim();
    if (reason.length < 10) {
      toast.error(text("سبب التعديل يجب أن يكون 10 أحرف على الأقل", "The correction reason must be at least 10 characters", "درستگی کی وجہ کم از کم 10 حروف پر مشتمل ہو"));
      return;
    }

    try {
      await correctionMutation.mutateAsync({
        attendanceId: editingRecord.id,
        correctedCheckInTime: correctedCheckIn ? new Date(correctedCheckIn) : undefined,
        correctedCheckOutTime: correctedCheckOut ? new Date(correctedCheckOut) : undefined,
        reason,
      });

      toast.success(text("تم إرسال طلب تصحيح الحضور للاعتماد", "Attendance correction sent for approval", "حاضری کی درستگی منظوری کے لیے بھیج دی گئی"));
      await refetchPendingCorrections();
      closeCorrectionDialog();
    } catch (error: any) {
      console.error("Attendance correction failed:", error);
      toast.error(error?.message || text("تعذّر إرسال طلب التصحيح", "Could not submit correction", "درستگی کی درخواست نہیں بھیجی جا سکی"));
    }
  };

  const handleReviewCorrection = async (correctionId: number, approved: boolean) => {
    try {
      await approveCorrectionMutation.mutateAsync({
        correctionId,
        approved,
      });

      toast.success(approved ? text("تم اعتماد التصحيح وتطبيقه", "Correction approved and applied", "درستگی منظور اور لاگو ہو گئی") : text("تم رفض طلب التصحيح", "Correction rejected", "درستگی مسترد ہو گئی"));
      await Promise.all([refetchPendingCorrections(), refetchToday()]);
    } catch (error: any) {
      console.error("Attendance correction review failed:", error);
      toast.error(error?.message || text("تعذّر معالجة طلب التصحيح", "Could not process correction", "درستگی پر کارروائی نہیں ہو سکی"));
    }
  };

  const formatCorrectionDateTime = (value?: string | Date | null) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "yyyy-MM-dd HH:mm");
  };

  // جدول "اليوم" يجب أن يعرض سجل اليوم نفسه، وليس التقرير الشهري.
  const selectedWorker = workers.find((w: any) => w.id === targetWorkerId);
  const attendanceRecords = todayAttendance
    ? [
        {
          ...todayAttendance,
          workerName: selectedWorker ? localizedName(selectedWorker, language) : "—",
          employeeId: selectedWorker?.employeeId ?? String(todayAttendance.workerId),
        },
      ]
    : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present":
      case "حاضر":
        return "bg-green-100 text-green-800";
      case "absent":
      case "غائب":
        return "bg-red-100 text-red-800";
      case "late":
      case "متأخر":
        return "bg-yellow-100 text-yellow-800";
      case "overtime":
      case "عمل إضافي":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const statusLabel = (status: string) => {
    if (status === "present" || status === "حاضر") return text("حاضر", "Present", "حاضر");
    if (status === "absent" || status === "غائب") return text("غائب", "Absent", "غیر حاضر");
    if (status === "late" || status === "متأخر") return text("متأخر", "Late", "دیر سے");
    if (status === "overtime" || status === "عمل إضافي") return text("عمل إضافي", "Overtime", "اضافی کام");
    return status;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{text("الحضور والانصراف", "Attendance", "حاضری اور روانگی")}</h1>
            <p className="text-gray-600 mt-1">{text("إدارة تسجيل حضور وانصراف العمال", "Manage worker check-in and check-out", "کارکنوں کی آمد اور روانگی کا انتظام")}</p>
          </div>
          <Button className="gap-2">
            <Upload className="w-4 h-4" />
            {text("استيراد من Excel", "Import from Excel", "Excel سے درآمد کریں")}
          </Button>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList>
            <TabsTrigger value="today">{text("اليوم", "Today", "آج")}</TabsTrigger>
            <TabsTrigger value="week">{text("هذا الأسبوع", "This week", "اس ہفتے")}</TabsTrigger>
            <TabsTrigger value="month">{text("هذا الشهر", "This month", "اس ماہ")}</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            {/* اختيار العامل (لتسجيل حضور عامل غير المستخدم الحالي) */}
            <Card>
              <CardContent className="pt-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {text("سجّل الحضور/الانصراف لعامل", "Record worker attendance", "کارکن کی حاضری درج کریں")}
                </label>
                <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder={text("اختر عاملًا (أو اتركه فارغًا لتسجيل حضورك أنت)", "Select a worker (or leave empty for your own attendance)", "کارکن منتخب کریں (یا اپنی حاضری کے لیے خالی چھوڑیں)")} />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.employeeId} - {localizedName(w, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Current Time and Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الوقت الحالي", "Current time", "موجودہ وقت")}</p>
                    <p className="text-3xl font-bold mt-2 font-mono">{format(currentTime, 'HH:mm:ss')}</p>
                  </div>
                </CardContent>
              </Card>
              <Button
                onClick={handleCheckIn}
                disabled={!!todayAttendance?.checkInTime || checkInMutation.isPending || !targetWorkerId}
                className="h-auto py-6 text-lg"
                variant={todayAttendance?.checkInTime ? "outline" : "default"}
              >
                {checkInMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Clock className="w-5 h-5 mr-2" />
                    {todayAttendance?.checkInTime
                      ? `${text("تم الحضور", "Checked in", "حاضری درج")}: ${format(new Date(todayAttendance.checkInTime), 'HH:mm')}`
                      : text("تسجيل الحضور", "Check in", "حاضری درج کریں")}
                  </>
                )}
              </Button>
              <Button
                onClick={handleCheckOut}
                disabled={!todayAttendance?.checkInTime || !!todayAttendance?.checkOutTime || checkOutMutation.isPending || !targetWorkerId}
                className="h-auto py-6 text-lg"
                variant={todayAttendance?.checkOutTime ? "outline" : "default"}
              >
                {checkOutMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Clock className="w-5 h-5 mr-2" />
                    {todayAttendance?.checkOutTime
                      ? `${text("تم الانصراف", "Checked out", "روانگی درج")}: ${format(new Date(todayAttendance.checkOutTime), 'HH:mm')}`
                      : text("تسجيل الانصراف", "Check out", "روانگی درج کریں")}
                  </>
                )}
              </Button>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الحاضرون", "Present", "حاضر")}</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الغائبون", "Absent", "غیر حاضر")}</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("المتأخرون", "Late", "دیر سے")}</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("معدل الحضور", "Attendance rate", "حاضری کی شرح")}</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* جدول الحضور */}
            <Card>
              <CardHeader>
                <CardTitle>{text("سجل الحضور اليومي", "Daily attendance record", "روزانہ حاضری ریکارڈ")}</CardTitle>
                <CardDescription>{text("التاريخ", "Date", "تاریخ")}: {selectedDate}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{text("الرقم الوظيفي", "Employee ID", "ملازم نمبر")}</TableHead>
                        <TableHead>{text("الاسم", "Name", "نام")}</TableHead>
                        <TableHead>{text("وقت الحضور", "Check-in time", "آمد کا وقت")}</TableHead>
                        <TableHead>{text("وقت الانصراف", "Check-out time", "روانگی کا وقت")}</TableHead>
                        <TableHead>{text("ساعات العمل", "Work hours", "کام کے اوقات")}</TableHead>
                        <TableHead>{text("الحالة", "Status", "حالت")}</TableHead>
                        <TableHead>{text("الإجراءات", "Actions", "کارروائیاں")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceRecords.length > 0 ? (
                        attendanceRecords.map((record: any) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{record.employeeId || record.workerId}</TableCell>
                            <TableCell>{record.workerName || "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm') : "-"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm') : "-"}
                              </div>
                            </TableCell>
                            <TableCell>{record.actualHours || 0} {text("ساعة", "hours", "گھنٹے")}</TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(record.status)}>
                                {statusLabel(record.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCorrectionDialog(record)}
                              >
                                {text("تعديل", "Edit", "ترمیم")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                            {text("لا توجد بيانات حضور", "No attendance records", "حاضری کا کوئی ریکارڈ نہیں")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {canApproveCorrections && (
              <Card>
                <CardHeader>
                  <CardTitle>{text("طلبات تصحيح الحضور المعلقة", "Pending attendance corrections", "زیر التوا حاضری درستگیاں")}</CardTitle>
                  <CardDescription>
                    {text("راجع التغييرات المطلوبة ثم اعتمدها أو ارفضها. عند الاعتماد تُطبّق الأوقات الجديدة ويُعاد حساب ساعات العمل.", "Review and approve or reject the requested changes. Approval applies the new times and recalculates work hours.", "مطلوبہ تبدیلیاں دیکھیں اور منظور یا مسترد کریں۔ منظوری پر نئے اوقات لاگو اور کام کے اوقات دوبارہ حساب ہوتے ہیں۔")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingPendingCorrections ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : !pendingCorrections?.length ? (
                    <p className="rounded border border-dashed py-6 text-center text-sm text-gray-500">
                      {text("لا توجد طلبات تصحيح معلقة", "No pending corrections", "کوئی درستگی زیر التوا نہیں")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{text("رقم الطلب", "Request ID", "درخواست نمبر")}</TableHead>
                            <TableHead>{text("سجل الحضور", "Attendance record", "حاضری ریکارڈ")}</TableHead>
                            <TableHead>{text("الحضور الأصلي", "Original check-in", "اصل آمد")}</TableHead>
                            <TableHead>{text("الحضور المصحح", "Corrected check-in", "درست شدہ آمد")}</TableHead>
                            <TableHead>{text("الانصراف الأصلي", "Original check-out", "اصل روانگی")}</TableHead>
                            <TableHead>{text("الانصراف المصحح", "Corrected check-out", "درست شدہ روانگی")}</TableHead>
                            <TableHead>{text("السبب", "Reason", "وجہ")}</TableHead>
                            <TableHead>{text("الإجراءات", "Actions", "کارروائیاں")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingCorrections.map((correction: any) => (
                            <TableRow key={correction.id}>
                              <TableCell className="font-medium">#{correction.id}</TableCell>
                              <TableCell>#{correction.attendanceId}</TableCell>
                              <TableCell>{formatCorrectionDateTime(correction.originalCheckIn)}</TableCell>
                              <TableCell>{formatCorrectionDateTime(correction.correctedCheckIn)}</TableCell>
                              <TableCell>{formatCorrectionDateTime(correction.originalCheckOut)}</TableCell>
                              <TableCell>{formatCorrectionDateTime(correction.correctedCheckOut)}</TableCell>
                              <TableCell className="min-w-48">{correction.reason}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="gap-1"
                                    disabled={approveCorrectionMutation.isPending}
                                    onClick={() => handleReviewCorrection(correction.id, true)}
                                  >
                                    {approveCorrectionMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                    {text("اعتماد", "Approve", "منظور کریں")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1"
                                    disabled={approveCorrectionMutation.isPending}
                                    onClick={() => handleReviewCorrection(correction.id, false)}
                                  >
                                    <X className="h-4 w-4" />
                                    {text("رفض", "Reject", "مسترد کریں")}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!editingRecord} onOpenChange={(open) => !open && closeCorrectionDialog()}>
          <DialogContent className="sm:max-w-md" dir={language === "en" ? "ltr" : "rtl"}>
            <DialogHeader>
              <DialogTitle>{text("تصحيح سجل الحضور", "Correct attendance record", "حاضری ریکارڈ درست کریں")}</DialogTitle>
              <DialogDescription>
                {text("عدّل وقت الحضور أو الانصراف، ثم اكتب سبب التصحيح. سيتم إرسال الطلب للاعتماد وفق نظام الصلاحيات.", "Change the check-in or check-out time and provide a reason. The request will be sent for approval according to permissions.", "آمد یا روانگی کا وقت بدلیں اور وجہ درج کریں۔ درخواست اجازتوں کے مطابق منظوری کے لیے بھیجی جائے گی۔")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="corrected-check-in">{text("وقت الحضور", "Check-in time", "آمد کا وقت")}</Label>
                <Input
                  id="corrected-check-in"
                  type="datetime-local"
                  value={correctedCheckIn}
                  onChange={(e) => setCorrectedCheckIn(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="corrected-check-out">{text("وقت الانصراف", "Check-out time", "روانگی کا وقت")}</Label>
                <Input
                  id="corrected-check-out"
                  type="datetime-local"
                  value={correctedCheckOut}
                  onChange={(e) => setCorrectedCheckOut(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="correction-reason">{text("سبب التعديل", "Correction reason", "درستگی کی وجہ")}</Label>
                <Textarea
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder={text("مثال: تم تسجيل وقت الانصراف بشكل غير صحيح", "Example: check-out time was recorded incorrectly", "مثال: روانگی کا وقت غلط درج ہوا")}
                  rows={3}
                />
                <p className="text-xs text-gray-500">{text("10 أحرف على الأقل", "At least 10 characters", "کم از کم 10 حروف")}</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                onClick={handleSubmitCorrection}
                disabled={correctionMutation.isPending || correctionReason.trim().length < 10}
              >
                {correctionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  text("إرسال التصحيح", "Submit correction", "درستگی بھیجیں")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeCorrectionDialog}
                disabled={correctionMutation.isPending}
              >
                {text("إلغاء", "Cancel", "منسوخ کریں")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
