import { TRPCError } from "@trpc/server";
import { branchLocations, jobTitles, locationDepartments } from "../../../drizzle/schema";
import { getDb } from "../../shared/db";
import type { ScopeUser } from "../../shared/worker-scope";

export async function orgScope(user: ScopeUser, write = false) {
  if (user.role === "admin" || !user.accessScope) return undefined;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
  const [branchLinks, departmentLinks, titles] = await Promise.all([db.select().from(branchLocations), db.select().from(locationDepartments), db.select().from(jobTitles)]);
  const centerIds = user.accessScope.costCenterIds;
  const locations = Array.from(new Set(branchLinks.filter(link => centerIds.includes(link.branchId)).map(link => link.locationId)))
    .filter(id => !write || branchLinks.filter(link => link.locationId === id).every(link => centerIds.includes(link.branchId)));
  const departments = Array.from(new Set(departmentLinks.filter(link => locations.includes(link.locationId)).map(link => link.departmentId)))
    .filter(id => !write || departmentLinks.filter(link => link.departmentId === id).every(link => locations.includes(link.locationId)));
  return { branches: centerIds, locations, departments, jobTitles: titles.filter(title => title.departmentId != null && departments.includes(title.departmentId)).map(title => title.id), branchLinks, departmentLinks };
}

export async function assertOrgScope(user: ScopeUser, kind: "branches" | "locations" | "departments" | "jobTitles", id?: number) {
  const scope = await orgScope(user, true);
  if (scope && (id == null || !scope[kind].includes(id))) throw new TRPCError({ code: "FORBIDDEN", message: "العنصر خارج نطاق صلاحياتك؛ استخدم الإضافة داخل مركزك أو موقعك المحدد" });
}

export async function assertOrgLinkScope(user: ScopeUser, kind: "branch" | "department", linkId: number) {
  const scope = await orgScope(user);
  if (!scope) return;
  const allowed = kind === "branch"
    ? scope.branchLinks.some(link => link.id === linkId && scope.branches.includes(link.branchId))
    : scope.departmentLinks.some(link => link.id === linkId && scope.locations.includes(link.locationId));
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "الرابط خارج نطاق صلاحياتك" });
}
