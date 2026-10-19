import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, Settings, AlertCircle, CheckCircle, Clock, TrendingUp } from "lucide-react";

/**
 * لوحة تحكم مدير النظام
 * عرض شامل لجميع عمليات المنصة والإحصائيات
 */
export default function AdminDashboard() {
  const systemStats = [
    { label: "إجمالي المستخدمين", value: "127", icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "المستخدمون النشطون", value: "95", icon: CheckCircle, color: "bg-green-100 text-green-600" },
    { label: "الأخطاء المعلقة", value: "3", icon: AlertCircle, color: "bg-red-100 text-red-600" },
    { label: "وقت التشغيل", value: "99.8%", icon: TrendingUp, color: "bg-purple-100 text-purple-600" },
  ];

  const recentActivities = [
    { user: "أحمد محمد", action: "تعديل بيانات عامل", time: "قبل 5 دقائق", status: "success" },
    { user: "فاطمة علي", action: "اعتماد حوافز", time: "قبل 15 دقيقة", status: "success" },
    { user: "محمود حسن", action: "إنشاء جدول جديد", time: "قبل 30 دقيقة", status: "success" },
    { user: "نور خالد", action: "تصحيح حضور", time: "قبل ساعة", status: "warning" },
    { user: "سارة يوسف", action: "تحديث إعدادات", time: "قبل ساعتين", status: "success" },
  ];

  const performanceData = [
    { hour: "00:00", requests: 120, errors: 2, latency: 45 },
    { hour: "04:00", requests: 95, errors: 1, latency: 38 },
    { hour: "08:00", requests: 450, errors: 5, latency: 52 },
    { hour: "12:00", requests: 620, errors: 8, latency: 65 },
    { hour: "16:00", requests: 580, errors: 6, latency: 58 },
    { hour: "20:00", requests: 400, errors: 4, latency: 48 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة تحكم مدير النظام</h1>
          <p className="text-gray-600 mt-1">عرض شامل لجميع عمليات المنصة والإحصائيات</p>
        </div>

        {/* المؤشرات الرئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {systemStats.map((stat, index) => {
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
            <TabsTrigger value="activities">الأنشطة</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
          </TabsList>

          {/* نظرة عامة */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>توزيع المستخدمين حسب الدور</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">مدير النظام</span>
                      <Badge>1</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">الشؤون الإدارية</span>
                      <Badge>5</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">المشرفون</span>
                      <Badge>8</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">الحراس</span>
                      <Badge>12</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">العمال</span>
                      <Badge>95</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">المراجعون الماليون</span>
                      <Badge>3</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">الماليون</span>
                      <Badge>2</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">رؤساء الحسابات</span>
                      <Badge>1</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>حالة النظام</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium">قاعدة البيانات</span>
                      <Badge className="bg-green-600">متصل</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium">خادم الويب</span>
                      <Badge className="bg-green-600">يعمل</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium">خدمة الإشعارات</span>
                      <Badge className="bg-green-600">نشطة</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium">خدمة الذكاء الاصطناعي</span>
                      <Badge className="bg-green-600">متاحة</Badge>
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
                <CardTitle>أداء النظام على مدار اليوم</CardTitle>
                <CardDescription>الطلبات والأخطاء وزمن الاستجابة</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="requests" fill="#3b82f6" name="الطلبات" />
                    <Bar dataKey="errors" fill="#ef4444" name="الأخطاء" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الأنشطة */}
          <TabsContent value="activities" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>الأنشطة الأخيرة</CardTitle>
                <CardDescription>آخر 5 عمليات على النظام</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivities.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{activity.user}</p>
                        <p className="text-sm text-gray-600">{activity.action}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{activity.time}</span>
                        <Badge variant={activity.status === "success" ? "default" : "secondary"}>
                          {activity.status === "success" ? "✓" : "⚠"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الإعدادات */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات النظام</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">التوقيت الزمني</p>
                    <p className="text-sm text-gray-600">Asia/Riyadh</p>
                  </div>
                  <Button variant="outline" size="sm">تعديل</Button>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">وقت الإقفال اليومي</p>
                    <p className="text-sm text-gray-600">04:29:00 صباحاً</p>
                  </div>
                  <Button variant="outline" size="sm">تعديل</Button>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">تفعيل الإشعارات</p>
                    <p className="text-sm text-gray-600">مفعّل</p>
                  </div>
                  <Button variant="outline" size="sm">تعديل</Button>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">نسخ احتياطية</p>
                    <p className="text-sm text-gray-600">آخر نسخة: اليوم في 02:00 صباحاً</p>
                  </div>
                  <Button variant="outline" size="sm">الآن</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
