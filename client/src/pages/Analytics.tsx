import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, Clock, Award } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

/**
 * صفحة الإحصائيات والتحليلات المتقدمة
 * تحليلات شاملة لأداء المنصة والعمال
 */
export default function Analytics() {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
  const performanceData = [
    { month: text("يناير", "January", "جنوری"), أداء: 75, حضور: 92, حوافز: 85 },
    { month: text("فبراير", "February", "فروری"), أداء: 78, حضور: 94, حوافز: 88 },
    { month: text("مارس", "March", "مارچ"), أداء: 82, حضور: 96, حوافز: 90 },
    { month: text("أبريل", "April", "اپریل"), أداء: 85, حضور: 95, حوافز: 92 },
    { month: text("مايو", "May", "مئی"), أداء: 88, حضور: 97, حوافز: 94 },
    { month: text("يونيو", "June", "جون"), أداء: 90, حضور: 98, حوافز: 96 },
  ];

  const departmentData = [
    { name: text("صيانة صباحية", "Morning maintenance", "صبح کی مرمت"), value: 25, employees: 12 },
    { name: text("مطاعم", "Restaurants", "ریستوران"), value: 30, employees: 18 },
    { name: text("تشغيل مسائي", "Evening operations", "شام کا آپریشن"), value: 20, employees: 10 },
    { name: text("كاشيرات", "Cashiers", "کیشیئر"), value: 25, employees: 15 },
  ];

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  const attendanceByDay = [
    { day: text("السبت", "Saturday", "ہفتہ"), حاضرون: 45, غائبون: 5 },
    { day: text("الأحد", "Sunday", "اتوار"), حاضرون: 48, غائبون: 2 },
    { day: text("الاثنين", "Monday", "پیر"), حاضرون: 47, غائبون: 3 },
    { day: text("الثلاثاء", "Tuesday", "منگل"), حاضرون: 49, غائبون: 1 },
    { day: text("الأربعاء", "Wednesday", "بدھ"), حاضرون: 46, غائبون: 4 },
    { day: text("الخميس", "Thursday", "جمعرات"), حاضرون: 50, غائبون: 0 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div role="note" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {text("تنبيه: الأرقام والرسوم في هذه الصفحة بيانات تجريبية ثابتة، ولا تمثل البيانات الفعلية للنظام.", "Notice: The figures and charts on this page are static sample data and do not represent the system’s actual data.", "تنبیہ: اس صفحے کے اعداد و شمار اور چارٹ مقررہ آزمائشی ڈیٹا ہیں اور سسٹم کے حقیقی ڈیٹا کی نمائندگی نہیں کرتے۔")}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{text("الإحصائيات والتحليلات", "Statistics and analytics", "اعداد و شمار اور تجزیات")}</h1>
          <p className="text-gray-600 mt-1">{text("تحليلات شاملة لأداء المنصة والعمال", "Platform and worker performance analytics", "پلیٹ فارم اور کارکنوں کی کارکردگی کا تجزیہ")}</p>
        </div>

        {/* مؤشرات رئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{text("متوسط الأداء", "Average performance", "اوسط کارکردگی")}</p>
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
                  <p className="text-sm text-gray-600">{text("معدل الحضور", "Attendance rate", "حاضری کی شرح")}</p>
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
                  <p className="text-sm text-gray-600">{text("إجمالي العمال", "Total workers", "کل کارکن")}</p>
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
                  <p className="text-sm text-gray-600">{text("الحوافز المدفوعة", "Incentives paid", "ادا شدہ مراعات")}</p>
                  <p className="text-3xl font-bold mt-2">94%</p>
                </div>
                <Award className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList>
            <TabsTrigger value="performance">{text("الأداء", "Performance", "کارکردگی")}</TabsTrigger>
            <TabsTrigger value="departments">{text("الأقسام", "Departments", "شعبے")}</TabsTrigger>
            <TabsTrigger value="attendance">{text("الحضور", "Attendance", "حاضری")}</TabsTrigger>
            <TabsTrigger value="trends">{text("الاتجاهات", "Trends", "رجحانات")}</TabsTrigger>
          </TabsList>

          {/* الأداء */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{text("تطور الأداء الشهري", "Monthly performance trends", "ماہانہ کارکردگی کے رجحانات")}</CardTitle>
                <CardDescription>{text("متوسط الأداء والحضور والحوافز عبر الأشهر", "Average performance, attendance and incentives across months", "ماہانہ اوسط کارکردگی، حاضری اور مراعات")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="أداء" name={text("الأداء", "Performance", "کارکردگی")} stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="حضور" name={text("الحضور", "Attendance", "حاضری")} stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="حوافز" name={text("الحوافز", "Incentives", "مراعات")} stroke="#f59e0b" strokeWidth={2} />
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
                  <CardTitle>{text("توزيع العمال حسب القسم", "Workers by department", "شعبے کے لحاظ سے کارکن")}</CardTitle>
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
                  <CardTitle>{text("عدد العمال بالقسم", "Workers per department", "ہر شعبے میں کارکنوں کی تعداد")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={departmentData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="employees" name={text("العمال", "Workers", "کارکن")} fill="#3b82f6" />
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
                <CardTitle>{text("الحضور حسب اليوم", "Attendance by day", "دن کے لحاظ سے حاضری")}</CardTitle>
                <CardDescription>{text("معدل الحضور والغياب خلال الأسبوع الحالي", "Attendance and absence during the current week", "موجودہ ہفتے کی حاضری اور غیر حاضری")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={attendanceByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="حاضرون" name={text("حاضرون", "Present", "حاضر")} fill="#10b981" />
                    <Bar dataKey="غائبون" name={text("غائبون", "Absent", "غیر حاضر")} fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* الاتجاهات */}
          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{text("الاتجاهات والأنماط", "Trends and patterns", "رجحانات اور نمونے")}</CardTitle>
                <CardDescription>{text("تحليل الاتجاهات والأنماط في الأداء", "Analysis of performance trends and patterns", "کارکردگی کے رجحانات اور نمونوں کا تجزیہ")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">📈 {text("تحسن الأداء", "Performance improvement", "کارکردگی میں بہتری")}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {text("ارتفاع متسارع في متوسط الأداء من 75% في يناير إلى 90% في يونيو", "Average performance increased from 75% in January to 90% in June", "اوسط کارکردگی جنوری میں 75% سے جون میں 90% تک بڑھی")}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">✅ {text("معدل حضور عالي", "High attendance rate", "حاضری کی بلند شرح")}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {text("معدل حضور ثابت فوق 92% مع تحسن تدريجي إلى 98%", "Attendance remained above 92%, rising gradually to 98%", "حاضری 92% سے زیادہ رہی اور بتدریج 98% تک بڑھی")}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="font-semibold text-gray-900">🎯 {text("توزيع متوازن", "Balanced distribution", "متوازن تقسیم")}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {text("توزيع عادل للعمال بين الأقسام المختلفة", "Even distribution of workers across departments", "مختلف شعبوں میں کارکنوں کی منصفانہ تقسیم")}
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
