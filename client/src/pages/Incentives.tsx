import { DashboardLayout } from "@/components/DashboardLayout";
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
      <div className="space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الحوافز والمكافآت</h1>
            <p className="text-gray-600 mt-1">إدارة الحوافز والدوام الإضافي والمكافآت</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة حافزة جديدة
          </Button>
        </div>

        {/* الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">إجمالي الحوافز</p>
                <p className="text-3xl font-bold mt-2">125,000 ر.س</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">المعتمدة</p>
                <p className="text-3xl font-bold mt-2">95,000 ر.س</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">المعلقة</p>
                <p className="text-3xl font-bold mt-2">30,000 ر.س</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">معدل الموافقة</p>
                <p className="text-3xl font-bold mt-2">76%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="incentives" className="w-full">
          <TabsList>
            <TabsTrigger value="incentives">الحوافز</TabsTrigger>
            <TabsTrigger value="overtimes">الدوام الإضافي</TabsTrigger>
            <TabsTrigger value="approvals">الاعتمادات</TabsTrigger>
          </TabsList>

          {/* الحوافز */}
          <TabsContent value="incentives" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>قائمة الحوافز</CardTitle>
                <CardDescription>جميع الحوافز المسجلة والمعتمدة</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم الوظيفي</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>الفئة</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>مرحلة الاعتماد</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incentives.map((incentive) => (
                        <TableRow key={incentive.id}>
                          <TableCell className="font-medium">{incentive.employeeId}</TableCell>
                          <TableCell>{incentive.name}</TableCell>
                          <TableCell>{incentive.category}</TableCell>
                          <TableCell>{incentive.amount} ر.س</TableCell>
                          <TableCell className="text-sm">{incentive.approvalStage}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(incentive.status)}>
                              {incentive.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {incentive.status === "معلق" && (
                                <>
                                  <Button variant="ghost" size="sm" className="gap-1 text-green-600">
                                    <Check className="w-4 h-4" />
                                    موافقة
                                  </Button>
                                  <Button variant="ghost" size="sm" className="gap-1 text-red-600">
                                    <X className="w-4 h-4" />
                                    رفض
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
                <CardTitle>الدوام الإضافي</CardTitle>
                <CardDescription>سجل الساعات الإضافية والمكافآت</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم الوظيفي</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>عدد الساعات</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overtimes.map((overtime) => (
                        <TableRow key={overtime.id}>
                          <TableCell className="font-medium">{overtime.employeeId}</TableCell>
                          <TableCell>{overtime.name}</TableCell>
                          <TableCell>{overtime.hours} ساعات</TableCell>
                          <TableCell>{overtime.amount} ر.س</TableCell>
                          <TableCell>{overtime.date}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(overtime.status)}>
                              {overtime.status}
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
                <CardTitle>دورة الاعتمادات</CardTitle>
                <CardDescription>مراحل اعتماد الحوافز الثلاث</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-semibold">المرحلة الأولى: الشؤون الإدارية</p>
                      <p className="text-sm text-gray-600">تدقيق أولي للحافزة والمستندات</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Clock className="w-6 h-6 text-yellow-600" />
                    <div className="flex-1">
                      <p className="font-semibold">المرحلة الثانية: المراجعة المالية</p>
                      <p className="text-sm text-gray-600">تحقق من الميزانية والمبالغ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Check className="w-6 h-6 text-green-600" />
                    <div className="flex-1">
                      <p className="font-semibold">المرحلة الثالثة: رئيس الحسابات</p>
                      <p className="text-sm text-gray-600">الموافقة النهائية والصرف</p>
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
