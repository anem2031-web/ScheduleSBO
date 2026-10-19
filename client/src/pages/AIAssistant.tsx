import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AIChatBox } from "@/features/ai-assistant/components/AIChatBox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

/**
 * صفحة مساعد الذكاء الاصطناعي
 * مساعد ذكي تفاعلي للإجابة على الاستفسارات وتحليل البيانات
 */
export default function AIAssistant() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant" | "system"; content: string }>>([]);
  const [activeTab, setActiveTab] = useState("chat");

  const suggestedQueries = [
    {
      title: "تحليل الأداء",
      description: "احسب متوسط أداء العمال هذا الأسبوع",
      category: "تحليل",
    },
    {
      title: "الحوافز المستحقة",
      description: "من العمال المستحقون للحوافز هذا الشهر؟",
      category: "حوافز",
    },
    {
      title: "تقرير الحضور",
      description: "ما هو معدل الحضور في القسم الأول؟",
      category: "حضور",
    },
    {
      title: "توقعات الرواتب",
      description: "ما هو إجمالي الرواتب المتوقع للشهر القادم؟",
      category: "رواتب",
    },
    {
      title: "التوصيات",
      description: "ما هي التوصيات لتحسين الأداء؟",
      category: "توصيات",
    },
    {
      title: "التقارير المتقدمة",
      description: "أنشئ تقرير شامل عن الأداء الربع سنوي",
      category: "تقارير",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">مساعد الذكاء الاصطناعي</h1>
          </div>
          <p className="text-gray-600 mt-1">مساعد ذكي لتحليل البيانات والإجابة على الاستفسارات</p>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList>
            <TabsTrigger value="chat">المحادثة</TabsTrigger>
            <TabsTrigger value="suggestions">الاستفسارات المقترحة</TabsTrigger>
            <TabsTrigger value="history">السجل</TabsTrigger>
          </TabsList>

          {/* المحادثة */}
          <TabsContent value="chat" className="space-y-6">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle>محادثة مع المساعد الذكي</CardTitle>
                <CardDescription>اطرح أسئلتك حول البيانات والتحليلات</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <AIChatBox 
                  messages={messages} 
                  onSendMessage={(message) => {
                    setMessages([...messages, { role: "user", content: message }]);
                    // هنا سيتم إضافة استدعاء API للحصول على رد من الذكاء الاصطناعي
                  }} 
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* الاستفسارات المقترحة */}
          <TabsContent value="suggestions" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestedQueries.map((query, index) => (
                <Card
                  key={index}
                  className="cursor-pointer hover:shadow-lg transition-shadow hover:border-blue-400"
                >
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{query.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {query.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{query.description}</p>
                      <button 
                        onClick={() => {
                          setMessages([...messages, { role: "user", content: query.description }]);
                          setActiveTab("chat");
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        اطرح السؤال →
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* السجل */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>سجل المحادثات</CardTitle>
                <CardDescription>جميع المحادثات السابقة مع المساعد الذكي</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <p className="font-medium text-gray-900">تحليل أداء العمال</p>
                    <p className="text-sm text-gray-600 mt-1">تم اليوم في 10:30 صباحاً</p>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <p className="font-medium text-gray-900">حساب الحوافز المستحقة</p>
                    <p className="text-sm text-gray-600 mt-1">تم أمس في 2:15 مساءً</p>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <p className="font-medium text-gray-900">تقرير معدل الحضور</p>
                    <p className="text-sm text-gray-600 mt-1">تم قبل يومين في 9:00 صباحاً</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* معلومات عن المساعد */}
        <Card>
          <CardHeader>
            <CardTitle>عن مساعد الذكاء الاصطناعي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-gray-700">
              مساعد ذكي يستخدم تقنيات الذكاء الاصطناعي المتقدمة للإجابة على استفسارات الإدارة حول:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>تحليل أداء العمال والفرق</li>
              <li>حساب الحوافز والمكافآت</li>
              <li>تقارير الحضور والانصراف</li>
              <li>توقعات الرواتب والمستحقات</li>
              <li>توصيات تحسين الأداء</li>
              <li>تحليل الاتجاهات والأنماط</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
