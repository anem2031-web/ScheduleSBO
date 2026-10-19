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

/**
 * صفحة الحضور والانصراف
 * تسجيل وإدارة حضور وانصراف العمال
 */
export default function Attendance() {
  const { user } = useAuth();
  // const { t } = useLanguage();
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
          ? `تم تسجيل الحضور (متأخر ${result.lateMinutes} دقيقة)`
          : "تم تسجيل الحضور بنجاح"
      );
      refetchToday();
    } catch (error: any) {
      console.error("Check-in failed:", error);
      toast.error(error?.message || "تعذّر تسجيل الحضور");
    }
  };

  const handleCheckOut = async () => {
    if (!targetWorkerId) return;
    try {
      const result = await checkOutMutation.mutateAsync({ workerId: targetWorkerId, checkOutTime: new Date() });
      toast.success(
        result?.overtimeMinutes && result.overtimeMinutes > 0
          ? `تم تسجيل الانصراف (عمل إضافي ${result.overtimeMinutes} دقيقة)`
          : "تم تسجيل الانصراف بنجاح"
      );
      refetchToday();
    } catch (error: any) {
      console.error("Check-out failed:", error);
      toast.error(error?.message || "تعذّر تسجيل الانصراف");
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
      toast.error("سبب التعديل يجب أن يكون 10 أحرف على الأقل");
      return;
    }

    try {
      await correctionMutation.mutateAsync({
        attendanceId: editingRecord.id,
        correctedCheckInTime: correctedCheckIn ? new Date(correctedCheckIn) : undefined,
        correctedCheckOutTime: correctedCheckOut ? new Date(correctedCheckOut) : undefined,
        reason,
      });

      toast.success("تم إرسال طلب تصحيح الحضور للاعتماد");
      await refetchPendingCorrections();
      closeCorrectionDialog();
    } catch (error: any) {
      console.error("Attendance correction failed:", error);
      toast.error(error?.message || "تعذّر إرسال طلب التصحيح");
    }
  };

  const handleReviewCorrection = async (correctionId: number, approved: boolean) => {
    try {
      await approveCorrectionMutation.mutateAsync({
        correctionId,
        approved,
      });

      toast.success(approved ? "تم اعتماد التصحيح وتطبيقه" : "تم رفض طلب التصحيح");
      await Promise.all([refetchPendingCorrections(), refetchToday()]);
    } catch (error: any) {
      console.error("Attendance correction review failed:", error);
      toast.error(error?.message || "تعذّر معالجة طلب التصحيح");
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
          workerName: selectedWorker?.nameAr ?? "N/A",
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الحضور والانصراف</h1>
            <p className="text-gray-600 mt-1">إدارة تسجيل حضور وانصراف العمال</p>
          </div>
          <Button className="gap-2">
            <Upload className="w-4 h-4" />
            استيراد من Excel
          </Button>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList>
            <TabsTrigger value="today">اليوم</TabsTrigger>
            <TabsTrigger value="week">هذا الأسبوع</TabsTrigger>
            <TabsTrigger value="month">هذا الشهر</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            {/* اختيار العامل (لتسجيل حضور عامل غير المستخدم الحالي) */}
            <Card>
              <CardContent className="pt-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  سجّل الحضور/الانصراف لعامل
                </label>
                <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="اختر عاملًا (أو اتركه فارغًا لتسجيل حضورك أنت)" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.employeeId} - {w.nameAr}
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
                    <p className="text-sm text-gray-600">الوقت الحالي</p>
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
                      ? `تم الحضور: ${format(new Date(todayAttendance.checkInTime), 'HH:mm')}`
                      : "تسجيل الحضور"}
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
                      ? `تم الانصراف: ${format(new Date(todayAttendance.checkOutTime), 'HH:mm')}`
                      : "تسجيل الانصراف"}
                  </>
                )}
              </Button>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الحاضرون</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الغائبون</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">المتأخرون</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">معدل الحضور</p>
                    <p className="text-3xl font-bold mt-2">-</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* جدول الحضور */}
            <Card>
              <CardHeader>
                <CardTitle>سجل الحضور اليومي</CardTitle>
                <CardDescription>التاريخ: {selectedDate}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم الوظيفي</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>وقت الحضور</TableHead>
                        <TableHead>وقت الانصراف</TableHead>
                        <TableHead>ساعات العمل</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>الإجراءات</TableHead>
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
                            <TableCell>{record.actualHours || 0} ساعة</TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(record.status)}>
                                {record.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCorrectionDialog(record)}
                              >
                                تعديل
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                            لا توجد بيانات حضور
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
                  <CardTitle>طلبات تصحيح الحضور المعلقة</CardTitle>
                  <CardDescription>
                    راجع التغييرات المطلوبة ثم اعتمدها أو ارفضها. عند الاعتماد تُطبّق الأوقات الجديدة ويُعاد حساب ساعات العمل.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingPendingCorrections ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : !pendingCorrections?.length ? (
                    <p className="rounded border border-dashed py-6 text-center text-sm text-gray-500">
                      لا توجد طلبات تصحيح معلقة
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>رقم الطلب</TableHead>
                            <TableHead>سجل الحضور</TableHead>
                            <TableHead>الحضور الأصلي</TableHead>
                            <TableHead>الحضور المصحح</TableHead>
                            <TableHead>الانصراف الأصلي</TableHead>
                            <TableHead>الانصراف المصحح</TableHead>
                            <TableHead>السبب</TableHead>
                            <TableHead>الإجراءات</TableHead>
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
                                    اعتماد
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1"
                                    disabled={approveCorrectionMutation.isPending}
                                    onClick={() => handleReviewCorrection(correction.id, false)}
                                  >
                                    <X className="h-4 w-4" />
                                    رفض
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
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>تصحيح سجل الحضور</DialogTitle>
              <DialogDescription>
                عدّل وقت الحضور أو الانصراف، ثم اكتب سبب التصحيح. سيتم إرسال الطلب للاعتماد وفق نظام الصلاحيات.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="corrected-check-in">وقت الحضور</Label>
                <Input
                  id="corrected-check-in"
                  type="datetime-local"
                  value={correctedCheckIn}
                  onChange={(e) => setCorrectedCheckIn(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="corrected-check-out">وقت الانصراف</Label>
                <Input
                  id="corrected-check-out"
                  type="datetime-local"
                  value={correctedCheckOut}
                  onChange={(e) => setCorrectedCheckOut(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="correction-reason">سبب التعديل</Label>
                <Textarea
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="مثال: تم تسجيل وقت الانصراف بشكل غير صحيح"
                  rows={3}
                />
                <p className="text-xs text-gray-500">10 أحرف على الأقل</p>
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
                  "إرسال التصحيح"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeCorrectionDialog}
                disabled={correctionMutation.isPending}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
