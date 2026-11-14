import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/lib/i18n";
import { demoPageText } from "@/lib/demo-pages-text";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Plus } from "lucide-react";

/**
 * صفحة الرواتب والمستحقات
 * إدارة الرواتب والخصومات والمستحقات
 */
export default function Payroll() {
  const { language } = useLanguage();
  const tr = (value: string) => demoPageText(value, language);
  const payrollData = [
    {
      id: 1,
      employeeId: "EMP001",
      name: "أحمد محمد",
      baseSalary: 5000,
      allowances: 1000,
      deductions: 500,
      netSalary: 5500,
      month: "يوليو 2026",
      status: "مدفوع",
    },
    {
      id: 2,
      employeeId: "EMP002",
      name: "فاطمة علي",
      baseSalary: 4500,
      allowances: 800,
      deductions: 300,
      netSalary: 5000,
      month: "يوليو 2026",
      status: "معلق",
    },
    {
      id: 3,
      employeeId: "EMP003",
      name: "محمود حسن",
      baseSalary: 6000,
      allowances: 1500,
      deductions: 800,
      netSalary: 6700,
      month: "يوليو 2026",
      status: "مدفوع",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "مدفوع":
        return "bg-green-100 text-green-800";
      case "معلق":
        return "bg-yellow-100 text-yellow-800";
      case "متأخر":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir={language === "en" ? "ltr" : "rtl"}>
        <p role="note" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{tr("عرض توضيحي: البيانات والأزرار في هذه الصفحة تجريبية وليست بيانات تشغيلية.")}</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tr("الرواتب والمستحقات")}</h1>
            <p className="text-gray-600 mt-1">{tr("إدارة الرواتب والخصومات والمستحقات")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              {tr("تصدير")}
            </Button>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              {tr("دورة رواتب جديدة")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("إجمالي الرواتب")}</p>
                <p className="text-3xl font-bold mt-2">16,200  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("المدفوعة")}</p>
                <p className="text-3xl font-bold mt-2">11,200  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("المعلقة")}</p>
                <p className="text-3xl font-bold mt-2">5,000  {tr("ر.س")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">{tr("معدل الصرف")}</p>
                <p className="text-3xl font-bold mt-2">69%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="current" className="w-full">
          <TabsList>
            <TabsTrigger value="current">{tr("الدورة الحالية")}</TabsTrigger>
            <TabsTrigger value="history">{tr("السجل التاريخي")}</TabsTrigger>
            <TabsTrigger value="deductions">{tr("الخصومات")}</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr("دورة الرواتب الحالية - يوليو 2026")}</CardTitle>
                <CardDescription>{tr("بيان الرواتب والمستحقات")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr("الرقم الوظيفي")}</TableHead>
                        <TableHead>{tr("الاسم")}</TableHead>
                        <TableHead>{tr("الراتب الأساسي")}</TableHead>
                        <TableHead>{tr("البدلات")}</TableHead>
                        <TableHead>{tr("الخصومات")}</TableHead>
                        <TableHead>{tr("الراتب الصافي")}</TableHead>
                        <TableHead>{tr("الحالة")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollData.map((payroll) => (
                        <TableRow key={payroll.id}>
                          <TableCell className="font-medium">{payroll.employeeId}</TableCell>
                          <TableCell>{tr(payroll.name)}</TableCell>
                          <TableCell>{payroll.baseSalary} {tr("ر.س")}</TableCell>
                          <TableCell>{payroll.allowances} {tr("ر.س")}</TableCell>
                          <TableCell>{payroll.deductions} {tr("ر.س")}</TableCell>
                          <TableCell className="font-semibold">{payroll.netSalary} {tr("ر.س")}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(payroll.status)}>
                              {tr(payroll.status)}
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

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>{tr("السجل التاريخي للرواتب")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">{tr("سيتم عرض السجل التاريخي للرواتب هنا")}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deductions">
            <Card>
              <CardHeader>
                <CardTitle>{tr("الخصومات والاستقطاعات")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">{tr("سيتم عرض الخصومات والاستقطاعات هنا")}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
