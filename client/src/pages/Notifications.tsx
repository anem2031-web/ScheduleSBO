import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Trash2,
  Check,
  AlertCircle,
  Info,
  CheckCircle,
} from "lucide-react";
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

interface Notification {
  id: number;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: "success",
      title: "تم قبول الطلب",
      message: "تم قبول طلب الإجازة الخاص بك للفترة من 15-20 يوليو",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      read: false,
    },
    {
      id: 2,
      type: "info",
      title: "تقييم جديد",
      message: "لديك تقييم جديد من المشرف أحمد محمد",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      read: false,
    },
    {
      id: 3,
      type: "warning",
      title: "تجاوز ساعات العمل",
      message: "لقد تجاوزت ساعات العمل المسموحة بـ 2 ساعة اليوم",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      read: true,
    },
    {
      id: 4,
      type: "info",
      title: "دورة اعتماد جديدة",
      message: "هناك 5 طلبات في انتظار الموافقة من قبلك",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      read: true,
    },
  ]);

  const [selectedNotifications, setSelectedNotifications] = useState<number[]>(
    [],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const handleMarkAsRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleDelete = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setSelectedNotifications((prev) => prev.filter((n) => n !== id));
  };

  const handleDeleteSelected = () => {
    setNotifications((prev) =>
      prev.filter((n) => !selectedNotifications.includes(n.id)),
    );
    setSelectedNotifications([]);
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === notifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(notifications.map((n) => n.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedNotifications((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );
  };

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">الإشعارات</h1>
            <p className="text-muted-foreground">
              لديك {unreadCount} إشعارات غير مقروءة
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {unreadCount}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">جميع الإشعارات</TabsTrigger>
          <TabsTrigger value="unread">غير مقروءة</TabsTrigger>
          <TabsTrigger value="success">نجاح</TabsTrigger>
          <TabsTrigger value="warning">تحذيرات</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <Check className="h-4 w-4 mr-2" />
              تحديد الكل كمقروء
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={selectedNotifications.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              حذف المحدد ({selectedNotifications.length})
            </Button>
          </div>

          <Card>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2 pb-4 border-b">
                  <Checkbox
                    checked={
                      selectedNotifications.length === notifications.length &&
                      notifications.length > 0
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    تحديد الكل
                  </span>
                </div>

                {notifications.length === 0 ? (
                  <div className="flex items-center justify-center h-96">
                    <p className="text-muted-foreground">لا توجد إشعارات</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                        notification.read
                          ? "bg-background"
                          : "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <Checkbox
                        checked={selectedNotifications.includes(
                          notification.id,
                        )}
                        onCheckedChange={() => toggleSelect(notification.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getIcon(notification.type)}
                          <h3 className="font-semibold">
                            {normalizeDigits(notification.title)}
                          </h3>
                          {!notification.read && (
                            <Badge variant="default" className="text-xs">
                              جديد
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {normalizeDigits(notification.message)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDateTime(
                            notification.timestamp,
                            timestampOptions,
                            "ar-SA",
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notification.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="unread" className="space-y-4">
          <Card>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 p-4">
                {notifications
                  .filter((n) => !n.read)
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className="flex gap-3 p-3 rounded-lg border bg-blue-50 border-blue-200"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getIcon(notification.type)}
                          <h3 className="font-semibold">
                            {normalizeDigits(notification.title)}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {normalizeDigits(notification.message)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDateTime(
                            notification.timestamp,
                            timestampOptions,
                            "ar-SA",
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="success" className="space-y-4">
          <Card>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 p-4">
                {notifications
                  .filter((n) => n.type === "success")
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className="flex gap-3 p-3 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getIcon(notification.type)}
                          <h3 className="font-semibold">
                            {normalizeDigits(notification.title)}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {normalizeDigits(notification.message)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="warning" className="space-y-4">
          <Card>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 p-4">
                {notifications
                  .filter((n) => n.type === "warning")
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className="flex gap-3 p-3 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getIcon(notification.type)}
                          <h3 className="font-semibold">
                            {normalizeDigits(notification.title)}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {normalizeDigits(notification.message)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
