import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

/**
 * لوحة تحكم الشؤون الإدارية
 * إدارة العمال والتقييمات والطلبات
 */
export default function HRDashboard() {
  const hrStats = [
    { label: "إجمالي العمال", value: "95", icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "العمال الجدد", value: "3", icon: TrendingUp, color: "bg-green-100 text-green-600" },
    { label: "الطلبات المعلقة", value: "7", icon: AlertCircle, color: "bg-yellow-100 text-yellow-600" },
    { label: "التقييمات المكتملة", value: "92%", icon: CheckCircle, color: "bg-purple-100 text-purple-600" },
  ];

  const departmentStats = [
    { name: "صيانة صباحية", employees: 12, avgRating: 4.2, attendance: 96 },
    { name: "مطاعم", employees: 18, avgRating: 3.9, attendance: 94 },
    { name: "تشغيل مسائي", employees: 10, avgRating: 4.1, attendance: 97 },
    { name: "كاشيرات", employees: 15, avgRating: 4.0, attendance: 95 },
    { name: "إدارة", employees: 12, avgRating: 4.3, attendance: 98 },
  ];

  const performanceData = [
    { week: "الأسبوع 1", excellent: 25, good: 45, average: 20, poor: 5 },
    { week: "الأسبوع 2", excellent: 28, good: 48, average: 18, poor: 4 },
    { week: "الأسبوع 3", excellent: 32, good: 50, average: 15, poor: 3 },
    { week: "الأسبوع 4", excellent: 35, good: 52, average: 12, poor: 2 },
  ];

  const pendingRequests = [
    { id: 1, employee: "أحمد محمد", type: "إجازة", date: "2026-07-20", status: "pending" },
    { id: 2, employee: "فاطمة علي", type: "تصحيح حضور", date: "2026-07-18", status: "pending" },
    { id: 3, employee: "محمود حسن", type: "تغيير ورديات", date: "2026-07-22", status: "approved" },
    { id: 4, employee: "نور خالد", type: "إجازة مرضية", date: "2026-07-19", status: "pending" },
    { id: 5, employee: "سارة يوسف", type: "تعديل بيانات", date: "2026-07-21", status: "rejected" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة تحكم الشؤون الإدارية</h1>
          <p className="text-gray-600 mt-1">إدارة العمال والتقييمات والطلبات</p>
        </div>

        {/* المؤشرات الرئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {hrStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{stat.label}</p>
                      <p className="text-3xl font-bold mt-2">{stat.value}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${stat.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="performance">الأداء</TabsTrigger>
            <TabsTrigger value="requests">الطلبات</TabsTrigger>
            <TabsTrigger value="departments">الأقسام</TabsTrigger>
          </TabsList>

          {/* نظرة عامة */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>توزيع العمال حسب الحالة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">نشطون</span>
                      <Badge className="bg-green-600">92</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">في إجازة</span>
                      <Badge className="bg-yellow-600">2</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">في إجازة مرضية</span>
                      <Badge className="bg-orange-600">1</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>الإجراءات المعلقة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">طلبات التبرير</span>
                      <Badge>3</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">طلبات الإجازات</span>
                      <Badge>2</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">تعديلات البيانات</span>
                      <Badge>2</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الأداء */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>تطور التقييمات الأسبوعي</CardTitle>
                <CardDescription>توزيع التقييمات حسب المستويات</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="excellent" fill="#10b981" name="ممتاز" />
                    <Bar dataKey="good" fill="#3b82f6" name="جيد" />
                    <Bar dataKey="average" fill="#f59e0b" name="متوسط" />
                    <Bar dataKey="poor" fill="#ef4444" name="ضعيف" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الطلبات */}
          <TabsContent value="requests" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>الطلبات المعلقة</CardTitle>
                <CardDescription>الطلبات التي تحتاج إلى معالجة</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{request.employee}</p>
                        <p className="text-sm text-gray-600">{request.type} - {request.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            request.status === "pending"
                              ? "secondary"
                              : request.status === "approved"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {request.status === "pending"
                            ? "قيد الانتظار"
                            : request.status === "approved"
                            ? "موافق عليه"
                            : "مرفوض"}
                        </Badge>
                        {request.status === "pending" && (
                          <Button size="sm" variant="outline">
                            معالجة
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الأقسام */}
          <TabsContent value="departments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>إحصائيات الأقسام</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {departmentStats.map((dept, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-gray-900">{dept.name}</h4>
                        <Badge>{dept.employees} عامل</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">متوسط التقييم</p>
                          <p className="text-lg font-bold text-yellow-600">{dept.avgRating}/5</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">معدل الحضور</p>
                          <p className="text-lg font-bold text-green-600">{dept.attendance}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
