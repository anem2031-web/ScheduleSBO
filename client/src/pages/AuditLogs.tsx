import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatDateTime, normalizeDigits } from "@shared/display-format";

const timestampOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
};

interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entityId: number;
  userId: number;
  userName: string;
  userRole: string;
  changes: string;
  timestamp: Date;
  ipAddress: string;
  status: "success" | "failed";
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([
    {
      id: 1,
      action: "CREATE",
      entity: "Worker",
      entityId: 101,
      userId: 1,
      userName: "أحمد محمد",
      userRole: "HR Admin",
      changes: "تم إنشاء موظف جديد: محمد علي",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      ipAddress: "192.168.1.100",
      status: "success",
    },
    {
      id: 2,
      action: "UPDATE",
      entity: "Payroll",
      entityId: 52,
      userId: 2,
      userName: "فاطمة أحمد",
      userRole: "Finance",
      changes: "تم تحديث الراتب من 5000 إلى 5500",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      ipAddress: "192.168.1.101",
      status: "success",
    },
    {
      id: 3,
      action: "DELETE",
      entity: "Request",
      entityId: 203,
      userId: 1,
      userName: "أحمد محمد",
      userRole: "HR Admin",
      changes: "تم حذف طلب إجازة",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      ipAddress: "192.168.1.100",
      status: "success",
    },
    {
      id: 4,
      action: "APPROVE",
      entity: "Evaluation",
      entityId: 75,
      userId: 3,
      userName: "علي سالم",
      userRole: "Supervisor",
      changes: "تم الموافقة على التقييم",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      ipAddress: "192.168.1.102",
      status: "success",
    },
    {
      id: 5,
      action: "REJECT",
      entity: "Incentive",
      entityId: 44,
      userId: 4,
      userName: "سارة خالد",
      userRole: "Finance Reviewer",
      changes: "تم رفض طلب حافزة",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      ipAddress: "192.168.1.103",
      status: "failed",
    },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.userName.includes(searchTerm) ||
      log.changes.includes(searchTerm) ||
      log.ipAddress.includes(searchTerm);

    const matchesAction = filterAction === "all" || log.action === filterAction;
    const matchesEntity = filterEntity === "all" || log.entity === filterEntity;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case "CREATE":
        return <Badge className="bg-green-600">إنشاء</Badge>;
      case "UPDATE":
        return <Badge className="bg-blue-600">تحديث</Badge>;
      case "DELETE":
        return <Badge className="bg-red-600">حذف</Badge>;
      case "APPROVE":
        return <Badge className="bg-emerald-600">موافقة</Badge>;
      case "REJECT":
        return <Badge className="bg-orange-600">رفض</Badge>;
      default:
        return <Badge>{action}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    return status === "success" ? (
      <Badge variant="outline" className="text-green-600">
        نجاح
      </Badge>
    ) : (
      <Badge variant="outline" className="text-red-600">
        فشل
      </Badge>
    );
  };

  const handleExport = () => {
    const csv = [
      [
        "الرقم",
        "الإجراء",
        "الكيان",
        "المستخدم",
        "الدور",
        "التغييرات",
        "التاريخ",
        "IP",
        "الحالة",
      ],
      ...filteredLogs.map((log) => [
        log.id,
        log.action,
        log.entity,
        log.userName,
        log.userRole,
        log.changes,
        formatDateTime(log.timestamp, timestampOptions, "ar-SA"),
        log.ipAddress,
        log.status,
      ]),
    ]
      .map((row) =>
        row.map((value) => normalizeDigits(String(value))).join(","),
      )
      .join("\n");

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
    );
    element.setAttribute("download", "audit-logs.csv");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">سجل التدقيق</h1>
            <p className="text-muted-foreground">
              تتبع جميع العمليات والتغييرات في النظام
            </p>
          </div>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          تصدير
        </Button>
      </div>

      <Card>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="بحث عن المستخدم أو التغييرات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger>
                <SelectValue placeholder="نوع الإجراء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الإجراءات</SelectItem>
                <SelectItem value="CREATE">إنشاء</SelectItem>
                <SelectItem value="UPDATE">تحديث</SelectItem>
                <SelectItem value="DELETE">حذف</SelectItem>
                <SelectItem value="APPROVE">موافقة</SelectItem>
                <SelectItem value="REJECT">رفض</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={setFilterEntity}>
              <SelectTrigger>
                <SelectValue placeholder="نوع الكيان" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الكيانات</SelectItem>
                <SelectItem value="Worker">موظف</SelectItem>
                <SelectItem value="Payroll">راتب</SelectItem>
                <SelectItem value="Request">طلب</SelectItem>
                <SelectItem value="Evaluation">تقييم</SelectItem>
                <SelectItem value="Incentive">حافزة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الإجراء</TableHead>
                <TableHead>الكيان</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>التغييرات</TableHead>
                <TableHead>التاريخ والوقت</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    لا توجد سجلات مطابقة
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>{normalizeDigits(log.entity)}</TableCell>
                    <TableCell>{normalizeDigits(log.userName)}</TableCell>
                    <TableCell>{normalizeDigits(log.userRole)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {normalizeDigits(log.changes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(log.timestamp, timestampOptions, "ar-SA")}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.ipAddress}
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
