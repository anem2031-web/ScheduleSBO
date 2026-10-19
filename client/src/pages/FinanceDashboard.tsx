import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

/**
 * لوحة تحكم المالية
 * إدارة الرواتب والحوافز والمستحقات
 */
export default function FinanceDashboard() {
  const financeStats = [
    { label: "إجمالي الرواتب الشهري", value: "450,000 ر.س", icon: DollarSign, color: "bg-blue-100 text-blue-600" },
    { label: "الحوافز المعتمدة", value: "85,000 ر.س", icon: TrendingUp, color: "bg-green-100 text-green-600" },
    { label: "المستحقات المعلقة", value: "12,000 ر.س", icon: AlertCircle, color: "bg-yellow-100 text-yellow-600" },
    { label: "الدوام الإضافي", value: "28,500 ر.س", icon: CheckCircle, color: "bg-purple-100 text-purple-600" },
  ];

  const monthlyPayroll = [
    { month: "يناير", salary: 450000, incentives: 75000, overtime: 25000 },
    { month: "فبراير", salary: 450000, incentives: 82000, overtime: 27000 },
    { month: "مارس", salary: 450000, incentives: 78000, overtime: 26000 },
    { month: "أبريل", salary: 450000, incentives: 85000, overtime: 28500 },
    { month: "مايو", salary: 450000, incentives: 80000, overtime: 25000 },
    { month: "يونيو", salary: 450000, incentives: 88000, overtime: 29000 },
  ];

  const expenseBreakdown = [
    { name: "الرواتب الأساسية", value: 450000, color: "#3b82f6" },
    { name: "الحوافز", value: 85000, color: "#10b981" },
    { name: "الدوام الإضافي", value: 28500, color: "#f59e0b" },
    { name: "الخصومات", value: 15000, color: "#ef4444" },
  ];

  const payrollStatus = [
    { id: 1, period: "يونيو 2026", status: "مدفوع", amount: "563,500 ر.س", date: "2026-06-30", approvals: "✓✓✓" },
    { id: 2, period: "مايو 2026", status: "مدفوع", amount: "555,000 ر.س", date: "2026-05-31", approvals: "✓✓✓" },
    { id: 3, period: "أبريل 2026", status: "قيد الانتظار", amount: "563,500 ر.س", date: "2026-04-30", approvals: "✓✓✗" },
    { id: 4, period: "مارس 2026", status: "مدفوع", amount: "554,000 ر.س", date: "2026-03-31", approvals: "✓✓✓" },
  ];

  const incentiveApprovals = [
    { id: 1, employee: "أحمد محمد", amount: "5,000 ر.س", status: "معتمد", approver: "مراجع مالي" },
    { id: 2, employee: "فاطمة علي", amount: "4,500 ر.س", status: "معتمد", approver: "مراجع مالي" },
    { id: 3, employee: "محمود حسن", amount: "6,000 ر.س", status: "قيد الانتظار", approver: "رئيس الحسابات" },
    { id: 4, employee: "نور خالد", amount: "5,500 ر.س", status: "معتمد", approver: "مراجع مالي" },
    { id: 5, employee: "سارة يوسف", amount: "4,800 ر.س", status: "قيد الانتظار", approver: "رئيس الحسابات" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة تحكم المالية</h1>
          <p className="text-gray-600 mt-1">إدارة الرواتب والحوافز والمستحقات</p>
        </div>

        {/* المؤشرات الرئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {financeStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{stat.label}</p>
                      <p className="text-2xl font-bold mt-2">{stat.value}</p>
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
            <TabsTrigger value="payroll">الرواتب</TabsTrigger>
            <TabsTrigger value="incentives">الحوافز</TabsTrigger>
            <TabsTrigger value="expenses">المصروفات</TabsTrigger>
          </TabsList>

          {/* نظرة عامة */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>الرواتب الشهرية</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={monthlyPayroll}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="salary" stroke="#3b82f6" name="الرواتب" />
                      <Line type="monotone" dataKey="incentives" stroke="#10b981" name="الحوافز" />
                      <Line type="monotone" dataKey="overtime" stroke="#f59e0b" name="الدوام الإضافي" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>توزيع المصروفات</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${(value / 1000).toFixed(0)}K`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {expenseBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الرواتب */}
          <TabsContent value="payroll" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>حالة الرواتب</CardTitle>
                <CardDescription>حالة دفع الرواتب الشهرية</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {payrollStatus.map((payroll) => (
                    <div key={payroll.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{payroll.period}</p>
                        <p className="text-sm text-gray-600">{payroll.amount} - {payroll.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">الاعتمادات: {payroll.approvals}</span>
                        <Badge variant={payroll.status === "مدفوع" ? "default" : "secondary"}>
                          {payroll.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الحوافز */}
          <TabsContent value="incentives" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>اعتمادات الحوافز</CardTitle>
                <CardDescription>حالة اعتماد الحوافز والمكافآت</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {incentiveApprovals.map((incentive) => (
                    <div key={incentive.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{incentive.employee}</p>
                        <p className="text-sm text-gray-600">{incentive.amount}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">بواسطة: {incentive.approver}</span>
                        <Badge variant={incentive.status === "معتمد" ? "default" : "secondary"}>
                          {incentive.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* المصروفات */}
          <TabsContent value="expenses" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>تحليل المصروفات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {expenseBreakdown.map((expense, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: expense.color }}
                        ></div>
                        <span className="text-sm font-medium">{expense.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{(expense.value / 1000).toFixed(1)}K ر.س</p>
                        <p className="text-xs text-gray-500">
                          {((expense.value / expenseBreakdown.reduce((sum, e) => sum + e.value, 0)) * 100).toFixed(1)}%
                        </p>
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
