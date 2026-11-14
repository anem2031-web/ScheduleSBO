import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/lib/i18n";
import { demoPageText } from "@/lib/demo-pages-text";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, X, Clock } from "lucide-react";

/**
 * صفحة الحوافز والمكافآت
 * إدارة الحوافز والدوام الإضافي ودورات الاعتماد
 */
export default function Incentives() {
  const { language } = useLanguage();
  const tr = (value: string) => demoPageText(value, language);
  // بيانات تجريبية
  const incentives = [
    {
      id: 1,
      employeeId: "EMP001",
      name: "أحمد محمد",
      amount: 500,
      category: "أداء متميز",
      status: "معتمد",
      approvalStage: "مكتمل",
      date: "2026-07-15",
    },
    {
      id: 2,
      employeeId: "EMP002",
      name: "فاطمة علي",
      amount: 750,
      category: "حضور منتظم",
      status: "معلق",
      approvalStage: "مراجعة مالية",
      date: "2026-07-14",
    },
    {
      id: 3,
      employeeId: "EMP003",
      name: "محمود حسن",
      amount: 300,
      category: "تعاون فريقي",
      status: "مرفوض",
      approvalStage: "مكتمل",
      date: "2026-07-13",
    },
  ];

  const overtimes = [
    {
      id: 1,
      employeeId: "EMP001",
      name: "أحمد محمد",
      hours: 5,
      date: "2026-07-15",
      amount: 75,
      status: "معتمد",
    },
    {
      id: 2,
      employeeId: "EMP002",
      name: "فاطمة علي",
      hours: 3,
      date: "2026-07-14",
      amount: 45,
      status: "معلق",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "معتمد":
        return "bg-green-100 text-green-800";
      case "معلق":
        return "bg-yellow-100 text-yellow-800";
      case "مرفوض":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir={language === "en" ? "ltr" : "rtl"}>
        <p role="note" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{tr("عرض توضيحي: البيانات والأزرار في هذه الصفحة تجريبية وليست بيانات تشغيلية.")}</p>
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tr("الحوافز والمكافآت")}</h1>
            <p className="text-gray-600 mt-1">{tr("إدارة الحوافز والدوام الإضافي والمكافآت")}</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            {tr("إضافة حافزة جديدة")}
          </Button>
        </div>

        {/* الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("إجمالي الحوافز")}</p>
                <p className="text-3xl font-bold mt-2">125,000  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("المعتمدة")}</p>
                <p className="text-3xl font-bold mt-2">95,000  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("المعلقة")}</p>
                <p className="text-3xl font-bold mt-2">30,000  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("معدل الموافقة")}</p>
                <p className="text-3xl font-bold mt-2">76%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="incentives" className="w-full">
          <TabsList>
            <TabsTrigger value="incentives">{tr("الحوافز")}</TabsTrigger>
            <TabsTrigger value="overtimes">{tr("الدوام الإضافي")}</TabsTrigger>
            <TabsTrigger value="approvals">{tr("الاعتمادات")}</TabsTrigger>
          </TabsList>

          {/* الحوافز */}
          <TabsContent value="incentives" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr("قائمة الحوافز")}</CardTitle>
                <CardDescription>{tr("جميع الحوافز المسجلة والمعتمدة")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr("الرقم الوظيفي")}</TableHead>
                        <TableHead>{tr("الاسم")}</TableHead>
                        <TableHead>{tr("الفئة")}</TableHead>
                        <TableHead>{tr("المبلغ")}</TableHead>
                        <TableHead>{tr("مرحلة الاعتماد")}</TableHead>
                        <TableHead>{tr("الحالة")}</TableHead>
                        <TableHead>{tr("الإجراءات")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incentives.map((incentive) => (
                        <TableRow key={incentive.id}>
                          <TableCell className="font-medium">{incentive.employeeId}</TableCell>
                          <TableCell>{tr(incentive.name)}</TableCell>
                          <TableCell>{tr(incentive.category)}</TableCell>
                          <TableCell>{incentive.amount} {tr("ر.س")}</TableCell>
                          <TableCell className="text-sm">{tr(incentive.approvalStage)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(incentive.status)}>
                              {tr(incentive.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {incentive.status === "معلق" && (
                                <>
                                  <Button variant="ghost" size="sm" className="gap-1 text-green-600">
                                    <Check className="w-4 h-4" />
                                    {tr("موافقة")}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="gap-1 text-red-600">
                                    <X className="w-4 h-4" />
                                    {tr("رفض")}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الدوام الإضافي */}
          <TabsContent value="overtimes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr("الدوام الإضافي")}</CardTitle>
                <CardDescription>{tr("سجل الساعات الإضافية والمكافآت")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr("الرقم الوظيفي")}</TableHead>
                        <TableHead>{tr("الاسم")}</TableHead>
                        <TableHead>{tr("عدد الساعات")}</TableHead>
                        <TableHead>{tr("المبلغ")}</TableHead>
                        <TableHead>{tr("التاريخ")}</TableHead>
                        <TableHead>{tr("الحالة")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overtimes.map((overtime) => (
                        <TableRow key={overtime.id}>
                          <TableCell className="font-medium">{overtime.employeeId}</TableCell>
                          <TableCell>{tr(overtime.name)}</TableCell>
                          <TableCell>{overtime.hours} {tr("ساعات")}</TableCell>
                          <TableCell>{overtime.amount} {tr("ر.س")}</TableCell>
                          <TableCell>{overtime.date}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(overtime.status)}>
                              {tr(overtime.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الاعتمادات */}
          <TabsContent value="approvals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr("دورة الاعتمادات")}</CardTitle>
                <CardDescription>{tr("مراحل اعتماد الحوافز الثلاث")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-semibold">{tr("المرحلة الأولى: الشؤون الإدارية")}</p>
                      <p className="text-sm text-gray-600">{tr("تدقيق أولي للحافزة والمستندات")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Clock className="w-6 h-6 text-yellow-600" />
                    <div className="flex-1">
                      <p className="font-semibold">{tr("المرحلة الثانية: المراجعة المالية")}</p>
                      <p className="text-sm text-gray-600">{tr("تحقق من الميزانية والمبالغ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Check className="w-6 h-6 text-green-600" />
                    <div className="flex-1">
                      <p className="font-semibold">{tr("المرحلة الثالثة: رئيس الحسابات")}</p>
                      <p className="text-sm text-gray-600">{tr("الموافقة النهائية والصرف")}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
