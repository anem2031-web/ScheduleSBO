import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, Clock, Award } from "lucide-react";

/**
 * صفحة الإحصائيات والتحليلات المتقدمة
 * تحليلات شاملة لأداء المنصة والعمال
 */
export default function Analytics() {
  const performanceData = [
    { month: "يناير", أداء: 75, حضور: 92, حوافز: 85 },
    { month: "فبراير", أداء: 78, حضور: 94, حوافز: 88 },
    { month: "مارس", أداء: 82, حضور: 96, حوافز: 90 },
    { month: "أبريل", أداء: 85, حضور: 95, حوافز: 92 },
    { month: "مايو", أداء: 88, حضور: 97, حوافز: 94 },
    { month: "يونيو", أداء: 90, حضور: 98, حوافز: 96 },
  ];

  const departmentData = [
    { name: "صيانة صباحية", value: 25, employees: 12 },
    { name: "مطاعم", value: 30, employees: 18 },
    { name: "تشغيل مسائي", value: 20, employees: 10 },
    { name: "كاشيرات", value: 25, employees: 15 },
  ];

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  const attendanceByDay = [
    { day: "السبت", حاضرون: 45, غائبون: 5 },
    { day: "الأحد", حاضرون: 48, غائبون: 2 },
    { day: "الاثنين", حاضرون: 47, غائبون: 3 },
    { day: "الثلاثاء", حاضرون: 49, غائبون: 1 },
    { day: "الأربعاء", حاضرون: 46, غائبون: 4 },
    { day: "الخميس", حاضرون: 50, غائبون: 0 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الإحصائيات والتحليلات</h1>
          <p className="text-gray-600 mt-1">تحليلات شاملة لأداء المنصة والعمال</p>
        </div>

        {/* مؤشرات رئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">متوسط الأداء</p>
                  <p className="text-3xl font-bold mt-2">88%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">معدل الحضور</p>
                  <p className="text-3xl font-bold mt-2">96%</p>
                </div>
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">إجمالي العمال</p>
                  <p className="text-3xl font-bold mt-2">55</p>
                </div>
                <Users className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">الحوافز المدفوعة</p>
                  <p className="text-3xl font-bold mt-2">94%</p>
                </div>
                <Award className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList>
            <TabsTrigger value="performance">الأداء</TabsTrigger>
            <TabsTrigger value="departments">الأقسام</TabsTrigger>
            <TabsTrigger value="attendance">الحضور</TabsTrigger>
            <TabsTrigger value="trends">الاتجاهات</TabsTrigger>
          </TabsList>

          {/* الأداء */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>تطور الأداء الشهري</CardTitle>
                <CardDescription>متوسط الأداء والحضور والحوافز عبر الأشهر</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="أداء" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="حضور" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="حوافز" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الأقسام */}
          <TabsContent value="departments" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>توزيع العمال حسب القسم</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={departmentData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {departmentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>عدد العمال بالقسم</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={departmentData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="employees" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الحضور */}
          <TabsContent value="attendance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>الحضور حسب اليوم</CardTitle>
                <CardDescription>معدل الحضور والغياب خلال الأسبوع الحالي</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={attendanceByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="حاضرون" fill="#10b981" />
                    <Bar dataKey="غائبون" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الاتجاهات */}
          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>الاتجاهات والأنماط</CardTitle>
                <CardDescription>تحليل الاتجاهات والأنماط في الأداء</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">📈 تحسن الأداء</p>
                    <p className="text-sm text-gray-600 mt-1">
                      ارتفاع متسارع في متوسط الأداء من 75% في يناير إلى 90% في يونيو
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">✅ معدل حضور عالي</p>
                    <p className="text-sm text-gray-600 mt-1">
                      معدل حضور ثابت فوق 92% مع تحسن تدريجي إلى 98%
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">🎯 توزيع متوازن</p>
                    <p className="text-sm text-gray-600 mt-1">
                      توزيع عادل للعمال بين الأقسام المختلفة
                    </p>
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
