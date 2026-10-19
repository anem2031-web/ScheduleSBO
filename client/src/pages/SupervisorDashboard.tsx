import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, Clock, TrendingUp, AlertCircle } from "lucide-react";

/**
 * لوحة تحكم المشرفين
 * إدارة الفريق والجداول والتقييمات
 */
export default function SupervisorDashboard() {
  const supervisorStats = [
    { label: "عمالي المباشرون", value: "12", icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "الحاضرون اليوم", value: "11", icon: Clock, color: "bg-green-100 text-green-600" },
    { label: "الغائبون", value: "1", icon: AlertCircle, color: "bg-red-100 text-red-600" },
    { label: "متوسط الأداء", value: "4.2/5", icon: TrendingUp, color: "bg-purple-100 text-purple-600" },
  ];

  const dailyAttendance = [
    { day: "السبت", present: 12, absent: 0, late: 0 },
    { day: "الأحد", present: 11, absent: 1, late: 0 },
    { day: "الاثنين", present: 12, absent: 0, late: 0 },
    { day: "الثلاثاء", present: 10, absent: 2, late: 0 },
    { day: "الأربعاء", present: 11, absent: 1, late: 0 },
    { day: "الخميس", present: 12, absent: 0, late: 0 },
    { day: "الجمعة", present: 12, absent: 0, late: 0 },
  ];

  const teamMembers = [
    { id: 1, name: "محمد أحمد", position: "عامل", status: "حاضر", rating: 4.5, attendance: 98 },
    { id: 2, name: "فاطمة علي", position: "عامل", status: "حاضر", rating: 4.3, attendance: 96 },
    { id: 3, name: "سارة يوسف", position: "عامل", status: "حاضر", rating: 4.1, attendance: 94 },
    { id: 4, name: "علي محمود", position: "عامل", status: "غائب", rating: 3.8, attendance: 90 },
    { id: 5, name: "نور خالد", position: "عامل", status: "حاضر", rating: 4.4, attendance: 97 },
  ];

  const todayTasks = [
    { id: 1, task: "إدخال التقييمات اليومية", dueTime: "16:00", priority: "high", completed: false },
    { id: 2, task: "مراجعة طلبات التبرير", dueTime: "17:00", priority: "medium", completed: false },
    { id: 3, task: "إعداد الجدول الأسبوعي", dueTime: "18:00", priority: "high", completed: false },
    { id: 4, task: "اجتماع مع الإدارة", dueTime: "15:00", priority: "medium", completed: true },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة تحكم المشرفين</h1>
          <p className="text-gray-600 mt-1">إدارة الفريق والجداول والتقييمات</p>
        </div>

        {/* المؤشرات الرئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {supervisorStats.map((stat, index) => {
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
            <TabsTrigger value="attendance">الحضور</TabsTrigger>
            <TabsTrigger value="team">الفريق</TabsTrigger>
            <TabsTrigger value="tasks">المهام</TabsTrigger>
          </TabsList>

          {/* نظرة عامة */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>ملخص الأداء</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">متوسط التقييم</span>
                      <span className="text-lg font-bold text-yellow-600">4.2/5</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">معدل الحضور</span>
                      <span className="text-lg font-bold text-green-600">95%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">الإنتاجية</span>
                      <span className="text-lg font-bold text-blue-600">92%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">الالتزام</span>
                      <span className="text-lg font-bold text-purple-600">98%</span>
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
                      <span className="text-sm text-gray-600">تقييمات معلقة</span>
                      <Badge>3</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">طلبات تبرير</span>
                      <Badge>2</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">تعديلات معلقة</span>
                      <Badge>1</Badge>
                    </div>
                    <Button className="w-full mt-3">معالجة الإجراءات</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الحضور */}
          <TabsContent value="attendance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>حضور الفريق الأسبوعي</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyAttendance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" fill="#10b981" name="حاضر" />
                    <Bar dataKey="absent" fill="#ef4444" name="غائب" />
                    <Bar dataKey="late" fill="#f59e0b" name="متأخر" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الفريق */}
          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>أعضاء الفريق</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{member.name}</p>
                        <p className="text-sm text-gray-600">{member.position}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-600">التقييم</p>
                          <p className="text-lg font-bold text-yellow-600">{member.rating}/5</p>
                        </div>
                        <Badge variant={member.status === "حاضر" ? "default" : "secondary"}>
                          {member.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* المهام */}
          <TabsContent value="tasks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>مهام اليوم</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {todayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        task.completed ? "bg-green-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          readOnly
                          className="w-5 h-5 rounded border-gray-300"
                        />
                        <div>
                          <p className={`font-medium ${task.completed ? "line-through text-gray-500" : "text-gray-900"}`}>
                            {task.task}
                          </p>
                          <p className="text-sm text-gray-600">الموعد: {task.dueTime}</p>
                        </div>
                      </div>
                      <Badge
                        variant={task.priority === "high" ? "destructive" : "secondary"}
                      >
                        {task.priority === "high" ? "عاجل" : "عادي"}
                      </Badge>
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
