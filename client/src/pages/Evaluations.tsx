import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/lib/i18n";
import { demoPageText } from "@/lib/demo-pages-text";
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
  const { language } = useLanguage();
  const tr = (value: string) => demoPageText(value, language);
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
      <div className="space-y-6" dir={language === "en" ? "ltr" : "rtl"}>
        <p role="note" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{tr("عرض توضيحي: البيانات والأزرار في هذه الصفحة تجريبية وليست بيانات تشغيلية.")}</p>
        {/* رأس الصفحة */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tr("التقييمات")}</h1>
            <p className="text-gray-600 mt-1">{tr("إدارة تقييمات الأداء والتطور الوظيفي")}</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            {tr("إضافة تقييم جديد")}
          </Button>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="daily" className="w-full">
          <TabsList>
            <TabsTrigger value="daily">{tr("تقييمات يومية")}</TabsTrigger>
            <TabsTrigger value="weekly">{tr("تقييمات أسبوعية")}</TabsTrigger>
            <TabsTrigger value="monthly">{tr("تقييمات شهرية")}</TabsTrigger>
          </TabsList>

          {/* التقييمات اليومية */}
          <TabsContent value="daily" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{tr("متوسط التقييم")}</p>
                    <p className="text-3xl font-bold mt-2">4.2</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{tr("عدد التقييمات")}</p>
                    <p className="text-3xl font-bold mt-2">47</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">{tr("المعتمدة")}</p>
                    <p className="text-3xl font-bold mt-2">42</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* جدول التقييمات */}
            <Card>
              <CardHeader>
                <CardTitle>{tr("التقييمات اليومية")}</CardTitle>
                <CardDescription>{tr("قائمة التقييمات المسجلة اليوم")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr("الرقم الوظيفي")}</TableHead>
                        <TableHead>{tr("الاسم")}</TableHead>
                        <TableHead>{tr("الدرجة")}</TableHead>
                        <TableHead>{tr("المقيّم")}</TableHead>
                        <TableHead>{tr("التاريخ")}</TableHead>
                        <TableHead>{tr("الحالة")}</TableHead>
                        <TableHead>{tr("الإجراءات")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evaluations.map((eval_) => (
                        <TableRow key={eval_.id}>
                          <TableCell className="font-medium">{eval_.employeeId}</TableCell>
                          <TableCell>{tr(eval_.name)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {renderStars(eval_.score)}
                              <span className="text-sm">{eval_.score}</span>
                            </div>
                          </TableCell>
                          <TableCell>{tr(eval_.reviewer)}</TableCell>
                          <TableCell>{eval_.date}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(eval_.status)}>
                              {tr(eval_.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" className="gap-1">
                                <Edit className="w-4 h-4" />
                                {tr("تعديل")}
                              </Button>
                              {eval_.status === "معلق" && (
                                <Button variant="ghost" size="sm" className="gap-1 text-green-600">
                                  <Check className="w-4 h-4" />
                                  {tr("اعتماد")}
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
                <CardTitle>{tr("التقييمات الأسبوعية")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">{tr("سيتم عرض التقييمات الأسبوعية هنا")}</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* التقييمات الشهرية */}
          <TabsContent value="monthly">
            <Card>
              <CardHeader>
                <CardTitle>{tr("التقييمات الشهرية")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">{tr("سيتم عرض التقييمات الشهرية هنا")}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
