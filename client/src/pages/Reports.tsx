import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Filter } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

/**
 * صفحة التقارير والتحليلات
 * تقارير شاملة عن الأداء والحضور والحوافز
 */
export default function Reports() {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  // بيانات التقارير
  const performanceData = [
    { month: text("يناير", "January", "جنوری"), score: 85 },
    { month: text("فبراير", "February", "فروری"), score: 88 },
    { month: text("مارس", "March", "مارچ"), score: 90 },
    { month: text("أبريل", "April", "اپریل"), score: 87 },
    { month: text("مايو", "May", "مئی"), score: 92 },
    { month: text("يونيو", "June", "جون"), score: 95 },
  ];

  const attendanceData = [
    { month: text("يناير", "January", "جنوری"), rate: 92 },
    { month: text("فبراير", "February", "فروری"), rate: 94 },
    { month: text("مارس", "March", "مارچ"), rate: 91 },
    { month: text("أبريل", "April", "اپریل"), rate: 95 },
    { month: text("مايو", "May", "مئی"), rate: 97 },
    { month: text("يونيو", "June", "جون"), rate: 96 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div role="note" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {text("تنبيه: الأرقام والرسوم في هذه الصفحة بيانات تجريبية ثابتة، ولا تمثل البيانات الفعلية للنظام.", "Notice: The figures and charts on this page are static sample data and do not represent the system’s actual data.", "تنبیہ: اس صفحے کے اعداد و شمار اور چارٹ مقررہ آزمائشی ڈیٹا ہیں اور سسٹم کے حقیقی ڈیٹا کی نمائندگی نہیں کرتے۔")}
        </div>
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{text("التقارير والتحليلات", "Reports and analytics", "رپورٹس اور تجزیات")}</h1>
            <p className="text-gray-600 mt-1">{text("تحليل شامل لأداء العمال والعمليات", "Worker performance and operations analysis", "کارکنوں اور آپریشنز کی کارکردگی کا تجزیہ")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              {text("تصفية", "Filter", "فلٹر")}
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              {text("تصدير", "Export", "برآمد کریں")}
            </Button>
          </div>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="performance" className="w-full">
          <TabsList>
            <TabsTrigger value="performance">{text("الأداء", "Performance", "کارکردگی")}</TabsTrigger>
            <TabsTrigger value="attendance">{text("الحضور", "Attendance", "حاضری")}</TabsTrigger>
            <TabsTrigger value="incentives">{text("الحوافز", "Incentives", "مراعات")}</TabsTrigger>
            <TabsTrigger value="payroll">{text("الرواتب", "Payroll", "تنخواہیں")}</TabsTrigger>
          </TabsList>

          {/* تقرير الأداء */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{text("تقرير الأداء الشهري", "Monthly performance report", "ماہانہ کارکردگی رپورٹ")}</CardTitle>
                <CardDescription>{text("متوسط درجات الأداء خلال الأشهر الستة الماضية", "Average performance scores over the last six months", "گزشتہ چھ ماہ کی اوسط کارکردگی")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" name={text("الأداء", "Performance", "کارکردگی")} stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("متوسط الأداء", "Average performance", "اوسط کارکردگی")}</p>
                    <p className="text-3xl font-bold mt-2">90.5</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("أعلى أداء", "Highest performance", "بہترین کارکردگی")}</p>
                    <p className="text-3xl font-bold mt-2">95</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("أقل أداء", "Lowest performance", "کم ترین کارکردگی")}</p>
                    <p className="text-3xl font-bold mt-2">85</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* تقرير الحضور */}
          <TabsContent value="attendance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{text("تقرير الحضور الشهري", "Monthly attendance report", "ماہانہ حاضری رپورٹ")}</CardTitle>
                <CardDescription>{text("معدل الحضور خلال الأشهر الستة الماضية", "Attendance rate over the last six months", "گزشتہ چھ ماہ کی حاضری کی شرح")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="rate" name={text("معدل الحضور", "Attendance rate", "حاضری کی شرح")} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("متوسط الحضور", "Average attendance", "اوسط حاضری")}</p>
                    <p className="text-3xl font-bold mt-2">94.3%</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("إجمالي الغياب", "Total absences", "کل غیر حاضری")}</p>
                    <p className="text-3xl font-bold mt-2">45</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("إجمالي التأخر", "Total late arrivals", "کل تاخیر")}</p>
                    <p className="text-3xl font-bold mt-2">28</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* تقرير الحوافز */}
          <TabsContent value="incentives" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("إجمالي الحوافز", "Total incentives", "کل مراعات")}</p>
                    <p className="text-3xl font-bold mt-2">125,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الحوافز المعتمدة", "Approved incentives", "منظور شدہ مراعات")}</p>
                    <p className="text-3xl font-bold mt-2">95,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الحوافز المعلقة", "Pending incentives", "زیر التوا مراعات")}</p>
                    <p className="text-3xl font-bold mt-2">30,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("معدل الموافقة", "Approval rate", "منظوری کی شرح")}</p>
                    <p className="text-3xl font-bold mt-2">76%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* تقرير الرواتب */}
          <TabsContent value="payroll" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("إجمالي الرواتب", "Total payroll", "کل تنخواہیں")}</p>
                    <p className="text-3xl font-bold mt-2">500,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الدوام الإضافي", "Overtime", "اضافی کام")}</p>
                    <p className="text-3xl font-bold mt-2">45,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الخصومات", "Deductions", "کٹوتیاں")}</p>
                    <p className="text-3xl font-bold mt-2">15,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{text("الصافي", "Net", "خالص")}</p>
                    <p className="text-3xl font-bold mt-2">530,000 ر.س</p>
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
