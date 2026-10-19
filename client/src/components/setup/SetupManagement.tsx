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
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { normalizeDigits } from "@shared/display-format";
import { AccountAccess, MyAccountAccess } from "./AccountAccess";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE, permits } from "@shared/access-control";

export function SimpleCatalogCard({
  title,
  description,
  listQuery,
  createMutation,
  updateMutation,
  deleteMutation,
  idField,
  invalidateKey,
}: {
  title: string;
  description: string;
  listQuery: any;
  createMutation: any;
  updateMutation: any;
  deleteMutation: any;
  idField: string;
  invalidateKey: string;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canManage = permits(user?.permissions ?? [], "org_structure:manage");
  const { data, isLoading } = listQuery.useQuery({});
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const invalidate = () => utils.orgStructure.invalidate();

  const create = createMutation.useMutation({
    onSuccess: () => {
      setCode("");
      setNameAr("");
      setError("");
      invalidate();
    },
    onError: (e: any) => setError(e.message),
  });
  const update = updateMutation.useMutation({
    onSuccess: invalidate,
    onError: (error: any) => toast.error(normalizeDigits(error.message)),
  });
  const remove = deleteMutation.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      invalidate();
    },
    onError: (e: any) => {
      setConfirmId(null);
      toast.error(normalizeDigits(e.message));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{normalizeDigits(title)}</CardTitle>
        <CardDescription>{normalizeDigits(description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && <div className="space-y-2">
          <Input
            placeholder="الرمز (مثال: TOLAN)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            placeholder="الاسم العربي"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
          {error && (
            <p className="text-xs text-red-600">{normalizeDigits(error)}</p>
          )}
          <Button
            size="sm"
            className="w-full gap-1"
            disabled={create.isPending || !code || !nameAr}
            onClick={() => create.mutate({ code, nameAr })}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            إضافة
          </Button>
        </div>}

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : !data?.length ? (
          <p className="rounded border border-dashed py-4 text-center text-xs text-gray-500">
            لا توجد عناصر بعد
          </p>
        ) : (
          <div className="space-y-1.5">
            {data.map((item: any) =>
              confirmId === item.id ? (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm"
                >
                  <span className="text-xs text-red-700">
                    حذف "{normalizeDigits(item.nameAr ?? "")}" نهائيًا؟
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ [idField]: item.id })}
                    >
                      {remove.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "تأكيد الحذف"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setConfirmId(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {normalizeDigits(item.nameAr ?? "")}
                    </span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="font-mono text-xs text-gray-500">
                      {normalizeDigits(item.code ?? "")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs"
                      disabled={!canManage}
                      onClick={() =>
                        update.mutate({
                          [idField]: item.id,
                          isActive: !item.isActive,
                        })
                      }
                    >
                      <Badge variant={item.isActive ? "default" : "outline"}>
                        {item.isActive ? "نشط" : "معطل"}
                      </Badge>
                    </button>
                    {canManage && <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={() => setConfirmId(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function JobTitlesCard() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canManage = permits(user?.permissions ?? [], "org_structure:manage");
  const { data, isLoading } = trpc.orgStructure.listJobTitles.useQuery({});
  const { data: departmentsData } = trpc.orgStructure.listDepartments.useQuery(
    {},
  );
  const [titleAr, setTitleAr] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const invalidate = () => utils.orgStructure.listJobTitles.invalidate();

  const create = trpc.orgStructure.createJobTitle.useMutation({
    onSuccess: () => {
      setTitleAr("");
      setDepartmentId("");
      setError("");
      invalidate();
    },
    onError: (e: any) => setError(e.message),
  });
  const update = trpc.orgStructure.updateJobTitle.useMutation({
    onSuccess: invalidate,
  });
  const remove = trpc.orgStructure.deleteJobTitle.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      invalidate();
    },
    onError: (e: any) => {
      setConfirmId(null);
      toast.error(normalizeDigits(e.message));
    },
  });

  const departmentName = (id: number | null) =>
    departmentsData?.find((d: any) => d.id === id)?.nameAr ?? "بلا قسم";

  return (
    <Card>
      <CardHeader>
        <CardTitle>المسميات الوظيفية</CardTitle>
        <CardDescription>
          كاشير، طباخ، مشرف وردية... يمكن ربط كل مسمى بقسم اختياريًا
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label="اسم المسمى الوظيفي"
            placeholder="اسم المسمى الوظيفي"
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
          />
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder="القسم (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              {departmentsData?.map((d: any) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {normalizeDigits(d.nameAr ?? "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gap-1"
            disabled={create.isPending || !titleAr.trim()}
            onClick={() =>
              create.mutate({
                code: `JOB_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
                titleAr: titleAr.trim(),
                departmentId: departmentId ? Number(departmentId) : undefined,
              })
            }
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            إضافة
          </Button>
        </div>}
        {error && (
          <p className="text-xs text-red-600">{normalizeDigits(error)}</p>
        )}

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : !data?.length ? (
          <p className="rounded border border-dashed py-4 text-center text-xs text-gray-500">
            لا توجد مسميات وظيفية بعد
          </p>
        ) : (
          <div className="space-y-1.5">
            {data.map((item: any) =>
              confirmId === item.id ? (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm"
                >
                  <span className="text-xs text-red-700">
                    حذف "{normalizeDigits(item.titleAr ?? "")}" نهائيًا؟
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 gap-1 px-2 text-xs"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ jobTitleId: item.id })}
                    >
                      {remove.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "تأكيد الحذف"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setConfirmId(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {normalizeDigits(item.titleAr ?? "")}
                    </span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="font-mono text-xs text-gray-500">
                      {normalizeDigits(item.code ?? "")}
                    </span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="text-xs text-gray-500">
                      {normalizeDigits(departmentName(item.departmentId))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs"
                      disabled={!canManage}
                      onClick={() =>
                        update.mutate({
                          jobTitleId: item.id,
                          isActive: !item.isActive,
                        })
                      }
                    >
                      <Badge variant={item.isActive ? "default" : "outline"}>
                        {item.isActive ? "نشط" : "معطل"}
                      </Badge>
                    </button>
                    {canManage && <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={() => setConfirmId(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مسؤول النظام",
  hr_admin: "مسؤول موارد بشرية",
  supervisor: "مشرف",
  guard: "حارس أمن",
  worker: "عامل",
  financial_reviewer: "مراجع مالي",
  finance: "مالية",
  accounting_head: "رئيس حسابات",
  modifier: "معدّل بيانات",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export function UsersTab({ allAccounts = false }: { allAccounts?: boolean }) {
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const {
    data,
    isLoading,
    error: loadError,
    refetch,
  } = trpc.users.listAll.useQuery();
  const formId = useId();

  const canManage = currentUser?.role === "admin";
  const [showArchived, setShowArchived] = useState(false);
  const [supervisorToArchive, setSupervisorToArchive] = useState<{
    id: number;
    name: string | null;
  } | null>(null);
  const visibleUsers = data?.filter(
    (item) =>
      allAccounts ||
      (item.role === "supervisor" && (showArchived || item.isActive)),
  );

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("supervisor");
  const [error, setError] = useState("");

  const invalidate = () =>
    Promise.all([
      utils.users.invalidate(),
      utils.schedules.getWeeklyBoard.invalidate(),
    ]);

  const create = trpc.auth.register.useMutation({
    onSuccess: () => {
      setEmail("");
      setUsername("");
      setPassword("");
      setName("");
      setRole("supervisor");
      setError("");
      invalidate();
      toast.success("تم إنشاء المستخدم بنجاح");
    },
    onError: (e: any) => setError(e.message),
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: invalidate,
    onError: (e: any) => toast.error(normalizeDigits(e.message)),
  });

  const updateStatus = trpc.users.updateStatus.useMutation({
    onSuccess: (_result, input) => {
      invalidate();
      toast.success(
        input.isActive ? "تمت استعادة الحساب وتفعيله" : "تم تعطيل الحساب",
      );
    },
    onError: (e: any) => toast.error(normalizeDigits(e.message)),
  });

  const archive = trpc.users.archiveSupervisor.useMutation({
    onSuccess: (result) => {
      setSupervisorToArchive(null);
      invalidate();
      toast.success(normalizeDigits(result.message));
    },
    onError: (e: any) => toast.error(normalizeDigits(e.message)),
  });

  const saveUser = () => {
    if (name.trim().length < 2)
      return setError("أدخل اسمًا واضحًا من خانتين على الأقل.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError("أدخل بريدًا إلكترونيًا صحيحًا لحساب الدخول.");
    if (password.length < MIN_PASSWORD_LENGTH) return setError(PASSWORD_LENGTH_MESSAGE);
    setError("");
    create.mutate({
      email: email.trim(),
      username: username.trim() || undefined,
      password,
      name: name.trim(),
      role: (allAccounts ? role : "supervisor") as any,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {allAccounts ? "إنشاء حساب مستخدم" : "إضافة مشرف"}
          </CardTitle>
          <CardDescription>
            {canManage
              ? "أنشئ الحساب هنا، ثم اربطه بالعمال من بطاقة العامل. يمكن ربط العامل بأكثر من مشرف."
              : "إنشاء الحسابات وتغيير صلاحياتها متاح لمسؤول النظام. يمكنك الاطلاع على المشرفين الموجودين."}
          </CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`${formId}-username`}>اسم الدخول (اختياري)</Label><Input id={`${formId}-username`} dir="ltr" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} placeholder="HR01" /></div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-name`}>الاسم</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم المشرف"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-email`}>
                  البريد الإلكتروني للدخول
                </Label>
                <Input
                  id={`${formId}-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-password`}>
                  كلمة المرور (7 خانات على الأقل)
                </Label>
                <Input
                  id={`${formId}-password`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {allAccounts && (
                <div className="space-y-1.5">
                  <Label>الدور</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {error && (
              <p className="text-xs text-red-600">{normalizeDigits(error)}</p>
            )}
            <Button
              className="gap-1"
              disabled={create.isPending || !email || !password || !name}
              onClick={saveUser}
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {allAccounts ? "إنشاء الحساب" : "حفظ المشرف"}
            </Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {allAccounts ? "حسابات المستخدمين" : "المشرفون الحاليون"}
          </CardTitle>
          <CardDescription>
            {canManage ? "إدارة الحساب وحالته" : "قائمة الحسابات الحالية"}
          </CardDescription>
          {!allAccounts && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              عرض المشرفين المؤرشفين والمعطلين أيضًا
            </label>
          )}
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p role="alert" className="text-sm text-red-600">
              تعذر تحميل الحسابات.{" "}
              <Button variant="link" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </p>
          ) : isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : !visibleUsers?.length ? (
            <p className="rounded border border-dashed py-4 text-center text-xs text-gray-500">
              {allAccounts
                ? "لا توجد حسابات بعد"
                : "لا يوجد مشرفون في هذه القائمة"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleUsers.map((u: any) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {normalizeDigits(u.name ?? "")}
                      </span>
                      {isSelf && (
                        <span className="mx-1.5 text-xs text-gray-400">
                          (أنت)
                        </span>
                      )}
                      <span className="mx-1.5 text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {allAccounts && (
                        <Select
                          value={u.role}
                          disabled={
                            !canManage || isSelf || updateRole.isPending
                          }
                          onValueChange={(newRole) =>
                            updateRole.mutate({
                              userId: u.id,
                              newRole: newRole as any,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <button
                        className="text-xs"
                        aria-label={normalizeDigits(
                          u.isActive
                            ? `تعطيل حساب ${u.name}`
                            : `استعادة حساب ${u.name}`,
                        )}
                        disabled={
                          !canManage || isSelf || updateStatus.isPending
                        }
                        onClick={() =>
                          updateStatus.mutate({
                            userId: u.id,
                            isActive: !u.isActive,
                          })
                        }
                      >
                        <Badge variant={u.isActive ? "default" : "outline"}>
                          {u.isActive
                            ? "نشط"
                            : canManage
                              ? "مؤرشف / معطل — استعادة"
                              : "مؤرشف / معطل"}
                        </Badge>
                      </button>
                      {canManage &&
                        !isSelf &&
                        u.role === "supervisor" &&
                        u.isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600 hover:text-red-700"
                            aria-label={normalizeDigits(`حذف المشرف ${u.name}`)}
                            disabled={archive.isPending}
                            onClick={() =>
                              setSupervisorToArchive({ id: u.id, name: u.name })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف المشرف
                          </Button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {allAccounts && <MyAccountAccess />}
      {allAccounts && canManage && data && <AccountAccess accounts={data} />}
      <AlertDialog
        open={supervisorToArchive !== null}
        onOpenChange={(open) => {
          if (!open && !archive.isPending) setSupervisorToArchive(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="sm:text-right">
            <AlertDialogTitle>
              حذف المشرف من القائمة وأرشفة حسابه
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إخراج «{normalizeDigits(supervisorToArchive?.name ?? "")}» من
              قائمة المشرفين النشطين وإيقاف دخوله إلى البرنامج. تُحفظ سجلاته
              السابقة وارتباطاته بالعمال والجداول، ولا تُحذف نهائيًا. يمكنك عرض
              الحسابات المؤرشفة واستعادة الحساب لاحقًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>
              إلغاء
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={archive.isPending || !supervisorToArchive}
              onClick={() => {
                if (supervisorToArchive)
                  archive.mutate({ userId: supervisorToArchive.id });
              }}
            >
              {archive.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "تأكيد الأرشفة وإيقاف الحساب"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
