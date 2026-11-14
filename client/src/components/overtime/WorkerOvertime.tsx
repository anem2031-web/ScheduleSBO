import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { permits } from "@shared/access-control";
import { useLanguage } from "@/lib/i18n";

/** Keep one approval page instead of repeating forms inside the leave section. */
export function WorkerOvertime({ workerId }: { workerId?: number }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => language === "en" ? en : language === "ur" ? ur : ar;
  if (!permits(user?.permissions ?? [], "overtime:read")) return null;
  return (
    <Card dir={language === "en" ? "ltr" : "rtl"}>
      <CardHeader>
        <CardTitle>{text("العمل الإضافي", "Overtime", "اوور ٹائم")}</CardTitle>
        <CardDescription>
          {text("الزيادات المخططة والفعلية وقرارات المشرف والشؤون الإدارية في سجل موحد.", "Planned and actual overtime with supervisor and administration decisions in one record.", "منصوبہ بند اور حقیقی اوور ٹائم اور سپروائزر و انتظامیہ کے فیصلے ایک ریکارڈ میں۔")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link
            href={workerId ? `/overtime?workerId=${workerId}` : "/overtime"}
          >
            {workerId
              ? text("فتح العمل الإضافي لهذا العامل", "Open this worker's overtime", "اس ملازم کا اوور ٹائم کھولیں")
              : text("فتح صفحة العمل الإضافي", "Open overtime page", "اوور ٹائم کا صفحہ کھولیں")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
