import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { normalizeDigits } from "@shared/display-format";

/** All linked supervisors are shown together; adding a link never replaces an existing one. */
export function WorkerSupervisorLinks({
  workerId,
  canManage,
}: {
  workerId: number;
  canManage: boolean;
}) {
  const utils = trpc.useUtils();
  const [supervisorId, setSupervisorId] = useState("");
  const links = trpc.supervisorAssignments.listAssignments.useQuery({
    activeOnly: true,
  });
  const supervisors = trpc.users.listByRole.useQuery(
    { role: "supervisor" },
    { enabled: canManage },
  );
  const ownLinks = (links.data ?? []).filter(
    (link) => link.workerId === workerId,
  );
  const available = (supervisors.data ?? []).filter(
    (user) =>
      user.isActive && !ownLinks.some((link) => link.supervisorId === user.id),
  );
  const invalidate = () =>
    utils.supervisorAssignments.listAssignments.invalidate();
  const add = trpc.supervisorAssignments.createAssignment.useMutation({
    onSuccess: () => {
      setSupervisorId("");
      toast.success("تم ربط المشرف بالعامل");
      invalidate();
    },
    onError: (error) => toast.error(normalizeDigits(error.message)),
  });
  const end = trpc.supervisorAssignments.endAssignment.useMutation({
    onSuccess: () => {
      toast.success("تم إنهاء الربط مع حفظ سجله السابق");
      invalidate();
    },
    onError: (error) => toast.error(normalizeDigits(error.message)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>المشرفون المرتبطون</CardTitle>
        <CardDescription>
          يمكن ربط أكثر من مشرف بالعامل من الحسابات المعدّة مسبقًا.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {normalizeDigits(links.error.message)}
          </p>
        ) : links.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : ownLinks.length ? (
          ownLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span>{normalizeDigits(link.supervisorName ?? "")}</span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={end.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `إنهاء ربط ${normalizeDigits(link.supervisorName ?? "")} بهذا العامل؟`,
                      )
                    )
                      end.mutate({ assignmentId: link.id });
                  }}
                >
                  <Unlink className="ml-2 h-4 w-4" />
                  إنهاء الربط
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            لم يُربط العامل بمشرف بعد.
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Select value={supervisorId} onValueChange={setSupervisorId}>
              <SelectTrigger className="min-w-48 flex-1">
                <SelectValue placeholder="اختر مشرفًا لإضافته" />
              </SelectTrigger>
              <SelectContent>
                {available.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {normalizeDigits(user.name ?? "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={
                !supervisorId ||
                add.isPending ||
                links.isLoading ||
                links.isError
              }
              onClick={() =>
                add.mutate({
                  workerId,
                  supervisorId: Number(supervisorId),
                  assignmentType: "secondary",
                })
              }
            >
              {add.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="ml-2 h-4 w-4" />
              )}
              ربط المشرف
            </Button>
            {supervisors.isError && (
              <p className="w-full text-sm text-destructive">
                {normalizeDigits(supervisors.error.message)}
              </p>
            )}
            {!supervisors.isLoading &&
              !supervisors.isError &&
              !available.length && (
                <p className="w-full text-xs text-muted-foreground">
                  لا يوجد مشرف آخر متاح. تُنشأ حسابات المشرفين من التهيئة.
                </p>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
