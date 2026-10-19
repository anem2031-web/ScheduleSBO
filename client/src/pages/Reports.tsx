import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Filter } from "lucide-react";

/**
 * صفحة التقارير والتحليلات
 * تقارير شاملة عن الأداء والحضور والحوافز
 */
export default function Reports() {
  // بيانات التقارير
  const performanceData = [
    { month: "يناير", score: 85 },
    { month: "فبراير", score: 88 },
    { month: "مارس", score: 90 },
    { month: "أبريل", score: 87 },
    { month: "مايو", score: 92 },
    { month: "يونيو", score: 95 },
  ];

  const attendanceData = [
    { month: "يناير", rate: 92 },
    { month: "فبراير", rate: 94 },
    { month: "مارس", rate: 91 },
    { month: "أبريل", rate: 95 },
    { month: "مايو", rate: 97 },
    { month: "يونيو", rate: 96 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">التقارير والتحليلات</h1>
            <p className="text-gray-600 mt-1">تحليل شامل لأداء العمال والعمليات</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              تصفية
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              تصدير
            </Button>
          </div>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="performance" className="w-full">
          <TabsList>
            <TabsTrigger value="performance">الأداء</TabsTrigger>
            <TabsTrigger value="attendance">الحضور</TabsTrigger>
            <TabsTrigger value="incentives">الحوافز</TabsTrigger>
            <TabsTrigger value="payroll">الرواتب</TabsTrigger>
          </TabsList>

          {/* تقرير الأداء */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>تقرير الأداء الشهري</CardTitle>
                <CardDescription>متوسط درجات الأداء خلال الأشهر الستة الماضية</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">متوسط الأداء</p>
                    <p className="text-3xl font-bold mt-2">90.5</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">أعلى أداء</p>
                    <p className="text-3xl font-bold mt-2">95</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">أقل أداء</p>
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
                <CardTitle>تقرير الحضور الشهري</CardTitle>
                <CardDescription>معدل الحضور خلال الأشهر الستة الماضية</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="rate" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">متوسط الحضور</p>
                    <p className="text-3xl font-bold mt-2">94.3%</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">إجمالي الغياب</p>
                    <p className="text-3xl font-bold mt-2">45</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">إجمالي التأخر</p>
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
                    <p className="text-sm text-gray-600">إجمالي الحوافز</p>
                    <p className="text-3xl font-bold mt-2">125,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الحوافز المعتمدة</p>
                    <p className="text-3xl font-bold mt-2">95,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الحوافز المعلقة</p>
                    <p className="text-3xl font-bold mt-2">30,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">معدل الموافقة</p>
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
                    <p className="text-sm text-gray-600">إجمالي الرواتب</p>
                    <p className="text-3xl font-bold mt-2">500,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الدوام الإضافي</p>
                    <p className="text-3xl font-bold mt-2">45,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الخصومات</p>
                    <p className="text-3xl font-bold mt-2">15,000 ر.س</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">الصافي</p>
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
