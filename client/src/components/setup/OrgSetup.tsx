import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2, Plus, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { normalizeDigits } from "@shared/display-format";
import { useAuth } from "@/_core/hooks/useAuth";
import { permits } from "@shared/access-control";

type CatalogItem = {
  id: number;
  code: string;
  nameAr: string;
  isActive: boolean;
};
const generatedCode = (prefix: string) => {
  // LAN deployments may use HTTP, where randomUUID is unavailable.
  const value =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${value.slice(0, 20)}`;
};

/** Keep existing many-to-many data while editing each relationship in its parent context. */
export function OrgSetup() {
  const utils = trpc.useUtils();
  const branches = trpc.orgStructure.listBranches.useQuery({});
  const locations = trpc.orgStructure.listLocations.useQuery({});
  const departments = trpc.orgStructure.listDepartments.useQuery({});
  const branchLinks = trpc.orgStructure.listBranchLocationLinks.useQuery();
  const departmentLinks =
    trpc.orgStructure.listLocationDepartmentLinks.useQuery();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    action: "delete" | "unlink";
    kind: "branch" | "location" | "department";
    id: number;
    name: string;
    parentId?: number;
    parentName?: string;
  } | null>(null);
  const [actionError, setActionError] = useState("");
  const selectedBranch =
    branches.data?.find((item) => item.id === branchId) ?? branches.data?.[0];
  const childLocations =
    locations.data?.filter((item) =>
      branchLinks.data?.some(
        (link) =>
          link.branchId === selectedBranch?.id && link.locationId === item.id,
      ),
    ) ?? [];
  const selectedLocation =
    childLocations.find((item) => item.id === locationId) ?? childLocations[0];
  const childDepartments =
    departments.data?.filter((item) =>
      departmentLinks.data?.some(
        (link) =>
          link.locationId === selectedLocation?.id &&
          link.departmentId === item.id,
      ),
    ) ?? [];
  const availableLocations =
    locations.data?.filter(
      (item) =>
        item.isActive && !childLocations.some((child) => child.id === item.id),
    ) ?? [];
  const availableDepartments =
    departments.data?.filter(
      (item) =>
        item.isActive &&
        !childDepartments.some((child) => child.id === item.id),
    ) ?? [];
  const refresh = () => utils.orgStructure.invalidate();
  const reportError = (error: { message: string }) =>
    toast.error(normalizeDigits(error.message));
  const createBranch = trpc.orgStructure.createBranch.useMutation({
    onSuccess: refresh,
    onError: reportError,
  });
  const createLocation = trpc.orgStructure.createLocationInBranch.useMutation({
    onSuccess: refresh,
    onError: reportError,
  });
  const createDepartment =
    trpc.orgStructure.createDepartmentInLocation.useMutation({
      onSuccess: refresh,
      onError: reportError,
    });
  const linkLocation = trpc.orgStructure.linkBranchLocation.useMutation({
    onSuccess: refresh,
    onError: reportError,
  });
  const linkDepartment = trpc.orgStructure.linkLocationDepartment.useMutation({
    onSuccess: refresh,
    onError: reportError,
  });
  const unlinkLocation = trpc.orgStructure.unlinkBranchLocation.useMutation({
    onSuccess: refresh,
    onError: reportError,
  });
  const unlinkDepartment =
    trpc.orgStructure.unlinkLocationDepartment.useMutation({
      onSuccess: refresh,
      onError: reportError,
    });
  const deleteBranch = trpc.orgStructure.deleteBranch.useMutation({
    onSuccess: refresh,
  });
  const deleteLocation = trpc.orgStructure.deleteLocation.useMutation({
    onSuccess: refresh,
  });
  const deleteDepartment = trpc.orgStructure.deleteDepartment.useMutation({
    onSuccess: refresh,
  });
  const actionPending = [
    unlinkLocation,
    unlinkDepartment,
    deleteBranch,
    deleteLocation,
    deleteDepartment,
  ].some((mutation) => mutation.isPending);
  const openAction = (target: NonNullable<typeof actionTarget>) => {
    setActionError("");
    setActionTarget(target);
  };
  const confirmAction = async () => {
    if (!actionTarget) return;
    setActionError("");
    try {
      if (actionTarget.action === "unlink") {
        if (actionTarget.kind === "location")
          await unlinkLocation.mutateAsync({ linkId: actionTarget.id });
        else await unlinkDepartment.mutateAsync({ linkId: actionTarget.id });
      } else if (actionTarget.kind === "branch") {
        await deleteBranch.mutateAsync({ branchId: actionTarget.id });
      } else if (actionTarget.kind === "location") {
        await deleteLocation.mutateAsync({
          locationId: actionTarget.id,
          contextBranchId: actionTarget.parentId,
        });
      } else {
        await deleteDepartment.mutateAsync({
          departmentId: actionTarget.id,
          contextLocationId: actionTarget.parentId,
        });
      }
      toast.success(
        actionTarget.action === "delete"
          ? "تم حذف العنصر"
          : "تم فك الارتباط مع إبقاء العنصر محفوظًا",
      );
      setActionTarget(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "تعذر تنفيذ العملية. حاول مجددًا.",
      );
    }
  };
  const loading = [
    branches,
    locations,
    departments,
    branchLinks,
    departmentLinks,
  ].some((query) => query.isLoading);
  const failed = [
    branches,
    locations,
    departments,
    branchLinks,
    departmentLinks,
  ].find((query) => query.error);

  if (loading)
    return (
      <p className="flex items-center gap-2 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        تحميل الهيكل التشغيلي…
      </p>
    );
  if (failed)
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 p-4 text-red-700"
      >
        تعذر تحميل الهيكل التشغيلي.{" "}
        <Button variant="link" onClick={refresh}>
          إعادة المحاولة
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ابدأ بمركز التكلفة، ثم أضف مواقعه وأقسام كل موقع من نفس الشاشة. يمكنك
        اختيار موقع أو قسم موجود وإضافته هنا دون تكراره.
      </p>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm"
        aria-label="المسار المختار"
      >
        <Building2 className="h-4 w-4" />
        <span>
          {normalizeDigits(selectedBranch?.nameAr ?? "أضف مركز التكلفة الأول")}
        </span>
        {selectedLocation && (
          <>
            <span aria-hidden="true">←</span>
            <span>{normalizeDigits(selectedLocation.nameAr)}</span>
          </>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ContextCard
          title="مراكز التكلفة"
          description="اختر المركز لإظهار مواقعه"
          items={branches.data ?? []}
          selectedId={selectedBranch?.id}
          onSelect={(id) => {
            setBranchId(id);
            setLocationId(null);
          }}
          onDelete={(item) =>
            openAction({
              action: "delete",
              kind: "branch",
              id: item.id,
              name: item.nameAr,
            })
          }
          createLabel="إضافة مركز تكلفة"
          pending={createBranch.isPending}
          onCreate={async (nameAr) => {
            const item = await createBranch.mutateAsync({
              code: generatedCode("CC"),
              nameAr,
            });
            if (item) {
              setBranchId(item.id);
              setLocationId(null);
            }
          }}
        />
        <ContextCard
          key={`locations-${selectedBranch?.id}`}
          title="المواقع"
          description={
            selectedBranch
              ? `مواقع ${selectedBranch.nameAr}`
              : "أضف مركز تكلفة أولًا"
          }
          items={childLocations}
          selectedId={selectedLocation?.id}
          onSelect={setLocationId}
          onDelete={(item) =>
            openAction({
              action: "delete",
              kind: "location",
              id: item.id,
              name: item.nameAr,
              parentId: selectedBranch?.id,
              parentName: selectedBranch?.nameAr,
            })
          }
          createLabel="إضافة موقع"
          disabled={!selectedBranch?.isActive}
          pending={createLocation.isPending || linkLocation.isPending}
          existingItems={availableLocations}
          existingLabel="ربط موقع موجود"
          onCreate={async (nameAr) => {
            if (!selectedBranch) return;
            const item = await createLocation.mutateAsync({
              branchId: selectedBranch.id,
              code: generatedCode("LOC"),
              nameAr,
            });
            if (item) setLocationId(item.id);
          }}
          onLink={async (id) => {
            if (!selectedBranch) return;
            await linkLocation.mutateAsync({
              branchId: selectedBranch.id,
              locationId: id,
            });
            setLocationId(id);
          }}
          onUnlink={(item) => {
            const link = branchLinks.data?.find(
              (link) =>
                link.branchId === selectedBranch?.id &&
                link.locationId === item.id,
            );
            if (link)
              openAction({
                action: "unlink",
                kind: "location",
                id: link.id,
                name: item.nameAr,
                parentName: selectedBranch?.nameAr,
              });
          }}
        />
        <ContextCard
          key={`departments-${selectedLocation?.id}`}
          title="الأقسام"
          description={
            selectedLocation
              ? `أقسام ${selectedLocation.nameAr}`
              : "اختر موقعًا أولًا"
          }
          items={childDepartments}
          onDelete={(item) =>
            openAction({
              action: "delete",
              kind: "department",
              id: item.id,
              name: item.nameAr,
              parentId: selectedLocation?.id,
              parentName: selectedLocation?.nameAr,
            })
          }
          createLabel="إضافة قسم"
          disabled={!selectedLocation?.isActive || !selectedBranch?.isActive}
          pending={createDepartment.isPending || linkDepartment.isPending}
          existingItems={availableDepartments}
          existingLabel="ربط قسم موجود"
          onCreate={async (nameAr) => {
            if (!selectedLocation) return;
            await createDepartment.mutateAsync({
              locationId: selectedLocation.id,
              code: generatedCode("DEPT"),
              nameAr,
            });
          }}
          onLink={async (id) => {
            if (!selectedLocation) return;
            await linkDepartment.mutateAsync({
              locationId: selectedLocation.id,
              departmentId: id,
            });
          }}
          onUnlink={(item) => {
            const link = departmentLinks.data?.find(
              (link) =>
                link.locationId === selectedLocation?.id &&
                link.departmentId === item.id,
            );
            if (link)
              openAction({
                action: "unlink",
                kind: "department",
                id: link.id,
                name: item.nameAr,
                parentName: selectedLocation?.nameAr,
              });
          }}
        />
      </div>
      <AlertDialog
        open={!!actionTarget}
        onOpenChange={(open) => {
          if (!open && !actionPending) setActionTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-start sm:text-start">
            <AlertDialogTitle>
              {actionTarget?.action === "delete" ? "حذف" : "فك ارتباط"} «
              {normalizeDigits(actionTarget?.name ?? "")}»؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              {normalizeDigits(
                actionTarget?.action === "unlink"
                  ? `سيُزال ارتباط «${actionTarget.name}» بـ«${actionTarget.parentName}» فقط. يبقى العنصر وارتباطاته الأخرى محفوظة ويمكن ربطه مجددًا.`
                  : `سيُحذف «${actionTarget?.name}» نهائيًا${actionTarget?.parentName ? ` مع ارتباطه الحالي بـ«${actionTarget.parentName}»` : ""}. لا يمكن التراجع عن الحذف. يمنع النظام حذف عنصر له عمال أو سجلات أو ارتباطات أخرى، ولا يحذفها تلقائيًا.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {normalizeDigits(actionError)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              إلغاء
            </AlertDialogCancel>
            <Button
              variant={
                actionTarget?.action === "delete" ? "destructive" : "default"
              }
              disabled={actionPending}
              onClick={confirmAction}
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionTarget?.action === "delete"
                ? "تأكيد الحذف"
                : "تأكيد فك الارتباط"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContextCard({
  title,
  description,
  items,
  selectedId,
  onSelect,
  createLabel,
  pending,
  disabled,
  onCreate,
  existingItems = [],
  existingLabel,
  onLink,
  onUnlink,
  onDelete,
}: {
  title: string;
  description: string;
  items: CatalogItem[];
  selectedId?: number;
  onSelect?: (id: number) => void;
  createLabel: string;
  pending: boolean;
  disabled?: boolean;
  onCreate: (name: string) => Promise<void>;
  existingItems?: CatalogItem[];
  existingLabel?: string;
  onLink?: (id: number) => Promise<void>;
  onUnlink?: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const { user } = useAuth();
  const canManage = permits(user?.permissions ?? [], "org_structure:manage");
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [existingId, setExistingId] = useState("");
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-lg">{normalizeDigits(title)}</CardTitle>
        <CardDescription>{normalizeDigits(description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {!items.length && (
            <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
              لا توجد عناصر هنا بعد
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex flex-wrap items-center gap-1 rounded-md border p-1 ${selectedId === item.id ? "border-primary bg-primary/5" : ""}`}
            >
              {onSelect ? (
                <button
                  type="button"
                  className="min-w-0 basis-full flex-1 break-words rounded px-2 py-2 text-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  {normalizeDigits(item.nameAr)}
                </button>
              ) : (
                <span className="min-w-0 basis-full flex-1 break-words px-2 py-2 text-sm">
                  {normalizeDigits(item.nameAr)}
                </span>
              )}
              {!item.isActive && <Badge variant="outline">معطل</Badge>}
              {canManage && onUnlink && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={normalizeDigits(`فك ارتباط ${item.nameAr}`)}
                  onClick={() => onUnlink(item)}
                >
                  <Unlink className="h-4 w-4" />
                  فك الارتباط
                </Button>
              )}
              {canManage && <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={normalizeDigits(`حذف ${item.nameAr}`)}
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>}
            </div>
          ))}
        </div>
        {!canManage ? null : !adding ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            {normalizeDigits(createLabel)}
          </Button>
        ) : (
          <form
            className="space-y-3 rounded-lg border bg-muted/20 p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                if (mode === "existing" && onLink)
                  await onLink(Number(existingId));
                else await onCreate(name.trim());
                setName("");
                setExistingId("");
                setAdding(false);
              } catch {
                /* Mutation reports an error without losing input. */
              }
            }}
          >
            {onLink && (
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant={mode === "new" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setMode("new")}
                >
                  إنشاء جديد
                </Button>
                <Button
                  type="button"
                  variant={mode === "existing" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setMode("existing")}
                >
                  {normalizeDigits(existingLabel ?? "")}
                </Button>
              </div>
            )}
            {mode === "new" ? (
              <Label className="block space-y-2">
                <span>الاسم</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={normalizeDigits(
                    createLabel.replace("إضافة", "اسم"),
                  )}
                  maxLength={255}
                  required
                  autoFocus
                />
              </Label>
            ) : (
              <Label className="block space-y-2">
                <span>{normalizeDigits(existingLabel ?? "")}</span>
                <Select value={existingId} onValueChange={setExistingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر من الموجود" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingItems.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {normalizeDigits(item.nameAr)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!existingItems.length && (
                  <span className="block text-xs text-muted-foreground">
                    لا توجد عناصر أخرى متاحة للربط.
                  </span>
                )}
              </Label>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={
                  pending ||
                  disabled ||
                  (mode === "new" ? !name.trim() : !existingId)
                }
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setAdding(false)}
              >
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
