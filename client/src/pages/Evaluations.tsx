import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Star, Plus, Edit, Check } from "lucide-react";

/**
 * صفحة التقييمات
 * إدارة تقييمات الأداء اليومية والأسبوعية والشهرية
 */
export default function Evaluations() {
  // بيانات تجريبية
  const evaluations = [
    {
      id: 1,
      employeeId: "EMP001",
      name: "أحمد محمد",
      evaluationType: "يومي",
      score: 4.5,
      date: "2026-07-15",
      status: "معتمد",
      reviewer: "محمود حسن",
    },
    {
      id: 2,
      employeeId: "EMP002",
      name: "فاطمة علي",
      evaluationType: "أسبوعي",
      score: 4.2,
      date: "2026-07-14",
      status: "معلق",
      reviewer: "أحمد محمد",
    },
    {
      id: 3,
      employeeId: "EMP003",
      name: "محمود حسن",
      evaluationType: "شهري",
      score: 3.8,
      date: "2026-07-10",
      status: "معتمد",
      reviewer: "فاطمة علي",
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

  const renderStars = (score: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i <= Math.round(score)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">التقييمات</h1>
            <p className="text-gray-600 mt-1">إدارة تقييمات الأداء والتطور الوظيفي</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة تقييم جديد
          </Button>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="daily" className="w-full">
          <TabsList>
            <TabsTrigger value="daily">تقييمات يومية</TabsTrigger>
            <TabsTrigger value="weekly">تقييمات أسبوعية</TabsTrigger>
            <TabsTrigger value="monthly">تقييمات شهرية</TabsTrigger>
          </TabsList>

          {/* التقييمات اليومية */}
          <TabsContent value="daily" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">متوسط التقييم</p>
                    <p className="text-3xl font-bold mt-2">4.2</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">عدد التقييمات</p>
                    <p className="text-3xl font-bold mt-2">47</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">المعتمدة</p>
                    <p className="text-3xl font-bold mt-2">42</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* جدول التقييمات */}
            <Card>
              <CardHeader>
                <CardTitle>التقييمات اليومية</CardTitle>
                <CardDescription>قائمة التقييمات المسجلة اليوم</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم الوظيفي</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>الدرجة</TableHead>
                        <TableHead>المقيّم</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evaluations.map((eval_) => (
                        <TableRow key={eval_.id}>
                          <TableCell className="font-medium">{eval_.employeeId}</TableCell>
                          <TableCell>{eval_.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {renderStars(eval_.score)}
                              <span className="text-sm">{eval_.score}</span>
                            </div>
                          </TableCell>
                          <TableCell>{eval_.reviewer}</TableCell>
                          <TableCell>{eval_.date}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(eval_.status)}>
                              {eval_.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" className="gap-1">
                                <Edit className="w-4 h-4" />
                                تعديل
                              </Button>
                              {eval_.status === "معلق" && (
                                <Button variant="ghost" size="sm" className="gap-1 text-green-600">
                                  <Check className="w-4 h-4" />
                                  اعتماد
                                </Button>
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

          {/* التقييمات الأسبوعية */}
          <TabsContent value="weekly">
            <Card>
              <CardHeader>
                <CardTitle>التقييمات الأسبوعية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">سيتم عرض التقييمات الأسبوعية هنا</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* التقييمات الشهرية */}
          <TabsContent value="monthly">
            <Card>
              <CardHeader>
                <CardTitle>التقييمات الشهرية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">سيتم عرض التقييمات الشهرية هنا</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
