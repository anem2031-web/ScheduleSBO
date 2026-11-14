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
import { useLanguage } from "@/lib/i18n";
import { localizedName } from "@/lib/localized-data";

type CatalogItem = {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  nameUr?: string | null;
  isActive: boolean;
};
const setupText = {
  ar: { loading:"تحميل الهيكل التشغيلي…", loadError:"تعذر تحميل الهيكل التشغيلي.", retry:"إعادة المحاولة", intro:"ابدأ بمركز التكلفة، ثم أضف مواقعه وأقسام كل موقع من نفس الشاشة. يمكنك اختيار موقع أو قسم موجود وإضافته هنا دون تكراره.", selectedPath:"المسار المختار", addFirst:"أضف مركز التكلفة الأول", centers:"مراكز التكلفة", centerHelp:"اختر المركز لإظهار مواقعه", addCenter:"إضافة مركز تكلفة", locations:"المواقع", addLocation:"إضافة موقع", linkLocation:"ربط موقع موجود", departments:"الأقسام", addDepartment:"إضافة قسم", linkDepartment:"ربط قسم موجود", chooseLocation:"اختر موقعًا أولًا", locationsOf:"مواقع", departmentsOf:"أقسام", deleted:"تم حذف العنصر", unlinked:"تم فك الارتباط مع إبقاء العنصر محفوظًا", actionError:"تعذر تنفيذ العملية. حاول مجددًا.", delete:"حذف", unlink:"فك ارتباط", cancel:"إلغاء", confirmDelete:"تأكيد الحذف", confirmUnlink:"تأكيد فك الارتباط", none:"لا توجد عناصر هنا بعد", disabled:"معطل", editNames:"تعديل الأسماء", save:"حفظ", createNew:"إنشاء جديد", name:"الاسم بالعربية", chooseExisting:"اختر من الموجود", noExisting:"لا توجد عناصر أخرى متاحة للربط." },
  en: { loading:"Loading the organization structure…", loadError:"Could not load the organization structure.", retry:"Try again", intro:"Start with a cost center, then add its locations and each location's departments on this screen. You can link an existing location or department without duplicating it.", selectedPath:"Selected path", addFirst:"Add the first cost center", centers:"Cost centers", centerHelp:"Select a center to show its locations", addCenter:"Add cost center", locations:"Locations", addLocation:"Add location", linkLocation:"Link an existing location", departments:"Departments", addDepartment:"Add department", linkDepartment:"Link an existing department", chooseLocation:"Choose a location first", locationsOf:"Locations for", departmentsOf:"Departments for", deleted:"Item deleted", unlinked:"Link removed; the item remains available", actionError:"Could not complete the action. Try again.", delete:"Delete", unlink:"Unlink", cancel:"Cancel", confirmDelete:"Confirm deletion", confirmUnlink:"Confirm unlinking", none:"No items here yet", disabled:"Inactive", editNames:"Edit names", save:"Save", createNew:"Create new", name:"Name in Arabic", chooseExisting:"Choose an existing item", noExisting:"No other items are available to link." },
  ur: { loading:"تنظیمی ڈھانچہ لوڈ ہو رہا ہے…", loadError:"تنظیمی ڈھانچہ لوڈ نہیں ہو سکا۔", retry:"دوبارہ کوشش کریں", intro:"پہلے لاگت کا مرکز منتخب کریں، پھر اسی اسکرین پر اس کے مقامات اور محکمے شامل کریں۔ موجودہ مقام یا محکمہ دوبارہ بنائے بغیر منسلک کیا جا سکتا ہے۔", selectedPath:"منتخب کردہ راستہ", addFirst:"پہلا لاگت مرکز شامل کریں", centers:"لاگت کے مراکز", centerHelp:"مقامات دیکھنے کے لیے مرکز منتخب کریں", addCenter:"لاگت مرکز شامل کریں", locations:"مقامات", addLocation:"مقام شامل کریں", linkLocation:"موجودہ مقام منسلک کریں", departments:"محکمے", addDepartment:"محکمہ شامل کریں", linkDepartment:"موجودہ محکمہ منسلک کریں", chooseLocation:"پہلے مقام منتخب کریں", locationsOf:"مقامات برائے", departmentsOf:"محکمے برائے", deleted:"آئٹم حذف کر دیا گیا", unlinked:"رابطہ ہٹا دیا گیا؛ آئٹم محفوظ ہے", actionError:"عمل مکمل نہ ہو سکا۔ دوبارہ کوشش کریں۔", delete:"حذف کریں", unlink:"رابطہ ختم کریں", cancel:"منسوخ کریں", confirmDelete:"حذف کرنے کی تصدیق", confirmUnlink:"رابطہ ختم کرنے کی تصدیق", none:"ابھی یہاں کوئی آئٹم نہیں", disabled:"غیر فعال", editNames:"ناموں میں ترمیم", save:"محفوظ کریں", createNew:"نیا بنائیں", name:"عربی میں نام", chooseExisting:"موجودہ آئٹم منتخب کریں", noExisting:"منسلک کرنے کے لیے مزید کوئی آئٹم دستیاب نہیں۔" },
} as const;
const generatedCode = (prefix: string) => {
  // LAN deployments may use HTTP, where randomUUID is unavailable.
  const value =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${value.slice(0, 20)}`;
};

/** Keep existing many-to-many data while editing each relationship in its parent context. */
export function OrgSetup() {
  const { language } = useLanguage();
  const text = setupText[language];
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
  const updateBranch = trpc.orgStructure.updateBranch.useMutation({ onSuccess: refresh, onError: reportError });
  const updateLocation = trpc.orgStructure.updateLocation.useMutation({ onSuccess: refresh, onError: reportError });
  const updateDepartment = trpc.orgStructure.updateDepartment.useMutation({ onSuccess: refresh, onError: reportError });
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
          ? text.deleted
          : text.unlinked,
      );
      setActionTarget(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : text.actionError,
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
        {text.loading}
      </p>
    );
  if (failed)
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 p-4 text-red-700"
      >
        {text.loadError}{" "}
        <Button variant="link" onClick={refresh}>
          {text.retry}
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {text.intro}
      </p>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm"
        aria-label={text.selectedPath}
      >
        <Building2 className="h-4 w-4" />
        <span>
          {normalizeDigits(selectedBranch ? localizedName(selectedBranch, language) : text.addFirst)}
        </span>
        {selectedLocation && (
          <>
            <span aria-hidden="true">←</span>
            <span>{normalizeDigits(localizedName(selectedLocation, language))}</span>
          </>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ContextCard
          title={text.centers}
          description={text.centerHelp}
          items={branches.data ?? []}
          onEdit={async (id, values) => { await updateBranch.mutateAsync({branchId: id, nameAr: values.nameAr, nameEn: values.nameEn}); }}
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
              name: localizedName(item, language),
            })
          }
          createLabel={text.addCenter}
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
          title={text.locations}
          description={
            selectedBranch
              ? `${text.locationsOf} ${localizedName(selectedBranch, language)}`
              : text.addFirst
          }
          items={childLocations}
          onEdit={async (id, values) => { await updateLocation.mutateAsync({locationId: id, nameAr: values.nameAr, nameEn: values.nameEn}); }}
          selectedId={selectedLocation?.id}
          onSelect={setLocationId}
          onDelete={(item) =>
            openAction({
              action: "delete",
              kind: "location",
              id: item.id,
              name: localizedName(item, language),
              parentId: selectedBranch?.id,
              parentName: selectedBranch ? localizedName(selectedBranch, language) : undefined,
            })
          }
          createLabel={text.addLocation}
          disabled={!selectedBranch?.isActive}
          pending={createLocation.isPending || linkLocation.isPending}
          existingItems={availableLocations}
          existingLabel={text.linkLocation}
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
                name: localizedName(item, language),
                parentName: selectedBranch ? localizedName(selectedBranch, language) : undefined,
              });
          }}
        />
        <ContextCard
          key={`departments-${selectedLocation?.id}`}
          title={text.departments}
          description={
            selectedLocation
              ? `${text.departmentsOf} ${localizedName(selectedLocation, language)}`
              : text.chooseLocation
          }
          items={childDepartments}
          supportsUrdu
          onEdit={async (id, values) => { await updateDepartment.mutateAsync({departmentId: id, ...values}); }}
          onDelete={(item) =>
            openAction({
              action: "delete",
              kind: "department",
              id: item.id,
              name: localizedName(item, language),
              parentId: selectedLocation?.id,
              parentName: selectedLocation ? localizedName(selectedLocation, language) : undefined,
            })
          }
          createLabel={text.addDepartment}
          disabled={!selectedLocation?.isActive || !selectedBranch?.isActive}
          pending={createDepartment.isPending || linkDepartment.isPending}
          existingItems={availableDepartments}
          existingLabel={text.linkDepartment}
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
                name: localizedName(item, language),
                parentName: selectedLocation ? localizedName(selectedLocation, language) : undefined,
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
        <AlertDialogContent dir={language === "en" ? "ltr" : "rtl"}>
          <AlertDialogHeader className="text-start sm:text-start">
            <AlertDialogTitle>
              {actionTarget?.action === "delete" ? text.delete : text.unlink} «
              {normalizeDigits(actionTarget?.name ?? "")}»؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              {normalizeDigits(
                actionTarget?.action === "unlink"
                  ? language === "en" ? `Only the link between “${actionTarget.name}” and “${actionTarget.parentName}” will be removed. The item and its other links remain and can be linked again.` : language === "ur" ? `صرف «${actionTarget.name}» اور «${actionTarget.parentName}» کا رابطہ ہٹایا جائے گا۔ آئٹم اور دوسرے روابط محفوظ رہیں گے اور اسے دوبارہ منسلک کیا جا سکتا ہے۔` : `سيُزال ارتباط «${actionTarget.name}» بـ«${actionTarget.parentName}» فقط. يبقى العنصر وارتباطاته الأخرى محفوظة ويمكن ربطه مجددًا.`
                  : language === "en" ? `“${actionTarget?.name}” will be permanently deleted${actionTarget?.parentName ? ` along with its current link to “${actionTarget.parentName}”` : ""}. This cannot be undone. The system prevents deletion if the item has workers, records or other links; it does not delete them automatically.` : language === "ur" ? `«${actionTarget?.name}» مستقل طور پر حذف ہو جائے گا${actionTarget?.parentName ? ` اور «${actionTarget.parentName}» سے اس کا موجودہ رابطہ بھی ہٹ جائے گا` : ""}۔ اسے واپس نہیں کیا جا سکتا۔ کارکنوں، ریکارڈ یا دیگر روابط والا آئٹم نظام حذف نہیں کرتا۔` : `سيُحذف «${actionTarget?.name}» نهائيًا${actionTarget?.parentName ? ` مع ارتباطه الحالي بـ«${actionTarget.parentName}»` : ""}. لا يمكن التراجع عن الحذف. يمنع النظام حذف عنصر له عمال أو سجلات أو ارتباطات أخرى، ولا يحذفها تلقائيًا.`,
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
              {text.cancel}
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
                ? text.confirmDelete
                : text.confirmUnlink}
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
  onEdit,
  supportsUrdu = false,
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
  onEdit?: (id: number, values: {nameAr: string; nameEn: string; nameUr?: string}) => Promise<void>;
  supportsUrdu?: boolean;
}) {
  const { language } = useLanguage();
  const text = setupText[language];
  const { user } = useAuth();
  const canManage = permits(user?.permissions ?? [], "org_structure:manage");
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [existingId, setExistingId] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editValues, setEditValues] = useState({ nameAr: "", nameEn: "", nameUr: "" });
  const [savingEdit, setSavingEdit] = useState(false);
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
              {text.none}
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
                  {normalizeDigits(localizedName(item, language))}
                </button>
              ) : (
                <span className="min-w-0 basis-full flex-1 break-words px-2 py-2 text-sm">
                  {normalizeDigits(localizedName(item, language))}
                </span>
              )}
              {!item.isActive && <Badge variant="outline">{text.disabled}</Badge>}
              {canManage && onEdit && <Button size="sm" variant="ghost" onClick={() => { setEditing(item); setEditValues({nameAr:item.nameAr, nameEn:item.nameEn ?? "", nameUr:item.nameUr ?? ""}); }}>
                {text.editNames}
              </Button>}
              {canManage && onUnlink && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={normalizeDigits(`${text.unlink} ${localizedName(item, language)}`)}
                  onClick={() => onUnlink(item)}
                >
                  <Unlink className="h-4 w-4" />
                  {text.unlink}
                </Button>
              )}
              {canManage && <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={normalizeDigits(`${text.delete} ${localizedName(item, language)}`)}
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
                {text.delete}
              </Button>}
            </div>
          ))}
        </div>
        {editing && onEdit && <form className="space-y-2 rounded-md border p-3" onSubmit={async event => {
          event.preventDefault(); setSavingEdit(true);
          try { await onEdit(editing.id, {nameAr: editValues.nameAr.trim(), nameEn: editValues.nameEn.trim(), ...(supportsUrdu ? {nameUr: editValues.nameUr.trim()} : {})}); setEditing(null); }
          catch { /* The mutation reports errors without discarding edits. */ }
          finally { setSavingEdit(false); }
        }}>
          <Label>العربية<Input required value={editValues.nameAr} onChange={event => setEditValues(v => ({...v,nameAr:event.target.value}))} /></Label>
          <Label>English<Input dir="ltr" value={editValues.nameEn} onChange={event => setEditValues(v => ({...v,nameEn:event.target.value}))} /></Label>
          {supportsUrdu && <Label>اردو<Input dir="rtl" value={editValues.nameUr} onChange={event => setEditValues(v => ({...v,nameUr:event.target.value}))} /></Label>}
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={savingEdit || !editValues.nameAr.trim()}>{text.save}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{text.cancel}</Button></div>
        </form>}
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
                  {text.createNew}
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
                <span>{text.name}</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={text.name}
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
                    <SelectValue placeholder={text.chooseExisting} />
                  </SelectTrigger>
                  <SelectContent>
                    {existingItems.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {normalizeDigits(localizedName(item, language))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!existingItems.length && (
                  <span className="block text-xs text-muted-foreground">
                    {text.noExisting}
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
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}{text.save}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setAdding(false)}
              >
                {text.cancel}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
