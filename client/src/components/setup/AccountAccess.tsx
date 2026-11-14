import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { normalizeDigits } from "@shared/display-format";
import { PERMISSION_CATALOG, type PermissionCode } from "@shared/access-control";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { localizedName } from "@/lib/localized-data";
import { accessText, permissionGroups, permissionNames } from "./account-access-text";

type Account = { id: number; name: string | null; role: string; username?: string | null };

/** Account-specific roles replace the broad defaults; an empty selection denies all actions. */
export function AccountAccess({ accounts }: { accounts: Account[] }) {
  const { language } = useLanguage();
  const text = accessText[language];
  const groupLabel = (group: string) => language === "ar" ? group : permissionGroups[group]?.[language === "en" ? 0 : 1] ?? group;
  const permissionLabel = (code: PermissionCode, name: string) => language === "ar" ? name : permissionNames[code][language === "en" ? 0 : 1];
  const utils = trpc.useUtils();
  const [userId, setUserId] = useState<number>();
  const [selected, setSelected] = useState<string[]>([]);
  const [limited, setLimited] = useState(false);
  const [centers, setCenters] = useState<number[]>([]);
  const [roleId, setRoleId] = useState("");
  const [copyId, setCopyId] = useState("");
  const target = accounts.find(account => account.id === userId);
  const access = trpc.users.accessSettings.useQuery({ userId: userId ?? 1 }, { enabled: !!userId });
  const source = trpc.users.accessSettings.useQuery({ userId: Number(copyId) || 1 }, { enabled: !!copyId });
  const roles = trpc.users.listAccessRoles.useQuery();
  const branches = trpc.orgStructure.listBranches.useQuery({});
  useEffect(() => {
    if (!access.data) return;
    setSelected(access.data.permissions);
    setLimited(access.data.scope !== null);
    setCenters(access.data.scope?.costCenterIds ?? []);
  }, [access.data]);
  const saved = async () => {
    await Promise.all([utils.users.invalidate(), utils.auth.me.invalidate()]);
    toast.success(text.saved);
  };
  const save = trpc.users.setAccess.useMutation({ onSuccess: saved, onError: error => toast.error(error.message) });
  const assign = trpc.users.assignAccessRoles.useMutation({ onSuccess: saved, onError: error => toast.error(error.message) });
  const scope = limited ? { costCenterIds: centers } : null;
  const toggle = (code: string) => setSelected(items => items.includes(code) ? items.filter(item => item !== code) : [...items, code]);
  const groups = Array.from(new Set(PERMISSION_CATALOG.map(([, category]) => category)));
  return <Card>
    <CardHeader>
      <CardTitle>{text.title}</CardTitle>
      <CardDescription>{text.description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="space-y-2"><Label htmlFor="access-account">{text.account}</Label>
        <select id="access-account" className="w-full rounded-md border bg-background p-2" value={userId ?? ""} onChange={event => { setUserId(Number(event.target.value) || undefined); setCopyId(""); setRoleId(""); }}>
          <option value="">{text.chooseAccount}</option>{accounts.map(account => <option key={account.id} value={account.id}>{normalizeDigits(account.name ?? account.username ?? String(account.id))}</option>)}
        </select>
      </div>
      {access.error && <p role="alert" className="text-destructive">{access.error.message}</p>}
      {target?.role === "admin" ? <p>{text.adminAll}</p> : target && access.data && <>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="access-template">{text.template}</Label>
            <select id="access-template" className="w-full rounded-md border bg-background p-2" value={roleId} onChange={event => setRoleId(event.target.value)}>
              <option value="">{text.chooseRole}</option>{roles.data?.filter(role => !role.nameEn.startsWith("ACCOUNT_ACCESS_")).map(role => <option key={role.id} value={role.id}>{normalizeDigits(localizedName(role, language))}</option>)}
            </select>
            <Button variant="outline" disabled={!roleId || assign.isPending} onClick={() => assign.mutate({ userId: target.id, roleIds: [Number(roleId)], scope })}>{text.assign}</Button>
          </div>
          <div className="space-y-2"><Label htmlFor="access-copy">{text.copy}</Label>
            <select id="access-copy" className="w-full rounded-md border bg-background p-2" value={copyId} onChange={event => setCopyId(event.target.value)}>
              <option value="">{text.chooseAccount}</option>{accounts.filter(account => account.id !== userId && account.role !== "admin").map(account => <option key={account.id} value={account.id}>{normalizeDigits(account.name ?? String(account.id))}</option>)}
            </select>
            <Button variant="outline" disabled={!source.data || source.isFetching} onClick={() => { if (source.data) { setSelected(source.data.permissions); setLimited(source.data.scope !== null); setCenters(source.data.scope?.costCenterIds ?? []); } }}>{text.copyToForm}</Button>
          </div>
        </div>
        <fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 font-medium">{text.scope}</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={limited} onChange={event => setLimited(event.target.checked)} />{text.limit}</label>
          {limited ? <><p className="text-xs text-muted-foreground">{text.noneCenters}</p><div className="flex flex-wrap gap-4">{branches.data?.map(center => <label key={center.id} className="flex items-center gap-2"><input type="checkbox" checked={centers.includes(center.id)} onChange={() => setCenters(items => items.includes(center.id) ? items.filter(id => id !== center.id) : [...items, center.id])} />{normalizeDigits(localizedName(center, language))}</label>)}</div></> : <p className="text-xs text-muted-foreground">{text.allCenters}</p>}
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(PERMISSION_CATALOG.filter(([code]) => !code.startsWith("users:") && !code.startsWith("settings:")).map(([code]) => code))}>{text.allWork}</Button><Button variant="outline" onClick={() => setSelected(PERMISSION_CATALOG.filter(([code]) => code.endsWith(":read") || code === "schedule:export").map(([code]) => code))}>{text.readOnly}</Button><Button variant="outline" onClick={() => setSelected([])}>{text.clear}</Button></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{groups.map(group => <fieldset key={group} className="space-y-2 rounded-lg border p-3"><legend className="px-1 font-medium">{groupLabel(group)}</legend>{PERMISSION_CATALOG.filter(([, category]) => category === group).map(([code, , name]) => <label key={code} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(code)} onChange={() => toggle(code)} />{permissionLabel(code, name)}</label>)}</fieldset>)}</div>
        <p className="text-sm text-muted-foreground">{text.selected}: {selected.length}. {text.adminOnly}</p>
        <Button disabled={save.isPending || assign.isPending} onClick={() => save.mutate({ userId: target.id, permissions: selected.filter(code => PERMISSION_CATALOG.some(([known]) => known === code)) as PermissionCode[], scope })}>{save.isPending ? text.saving : text.save}</Button>
      </>}
    </CardContent>
  </Card>;
}

export function MyAccountAccess() {
  const { language } = useLanguage();
  const text = accessText[language];
  const permissions = trpc.users.getMyPermissions.useQuery();
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">{text.my}</summary><div className="pt-3 text-sm">{permissions.data?.includes("*") ? text.all : <ul className="grid gap-1 md:grid-cols-2">{PERMISSION_CATALOG.filter(([code]) => permissions.data?.includes(code)).map(([code, , name]) => <li key={code}>{language === "ar" ? name : permissionNames[code][language === "en" ? 0 : 1]}</li>)}</ul>}</div></details>;
}
