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

/** Keep one approval page instead of repeating forms inside the leave section. */
export function WorkerOvertime({ workerId }: { workerId?: number }) {
  const { user } = useAuth();
  if (!permits(user?.permissions ?? [], "overtime:read")) return null;
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>العمل الإضافي</CardTitle>
        <CardDescription>
          الزيادات المخططة والفعلية وقرارات المشرف والشؤون الإدارية في سجل موحد.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link
            href={workerId ? `/overtime?workerId=${workerId}` : "/overtime"}
          >
            {workerId
              ? "فتح العمل الإضافي لهذا العامل"
              : "فتح صفحة العمل الإضافي"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
