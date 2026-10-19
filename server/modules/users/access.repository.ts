import { eq, inArray } from "drizzle-orm";
import { permissions, rolePermissions, roles, userAccessScopes, userRoles } from "../../../drizzle/schema";
import { PERMISSION_CATALOG, type AccessScope } from "../../../shared/access-control";
import { getDb } from "../../shared/db";
import { effectivePermissions, type AuthorizedUser } from "../../shared/rbac";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  return db;
}

export async function loadUserAccess<T extends AuthorizedUser>(user: T): Promise<T & AuthorizedUser> {
  const db = await getDb();
  if (!db) return Object.assign(user, { permissions: effectivePermissions(user), accessScope: null });
  const memberships = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, user.id));
  let grants = effectivePermissions(user);
  if (user.role !== "admin" && memberships.length) {
    const rows = await db.select({ code: permissions.code }).from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, memberships.map(row => row.roleId)));
    grants = Array.from(new Set(rows.map(row => row.code.replace(".", ":"))));
  }
  const [scope] = await db.select().from(userAccessScopes).where(eq(userAccessScopes.userId, user.id)).limit(1);
  return Object.assign(user, {
    permissions: grants,
    accessScope: user.role === "admin" || !scope ? null : { costCenterIds: scope.costCenterIds as number[] },
  });
}

export async function listAccessRoles() {
  const db = await database();
  const all = await db.select().from(roles);
  const links = await db.select({ roleId: rolePermissions.roleId, code: permissions.code }).from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
  return all.map(role => ({ ...role, permissions: links.filter(link => link.roleId === role.id).map(link => link.code.replace(".", ":")) }));
}

export async function getAccountRoleIds(userId: number) {
  const db = await database();
  return (await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId))).map(row => row.roleId);
}

/** A role with zero grants intentionally denies every action for non-admin accounts. */
export async function saveAccountAccess(input: { userId: number; permissions: string[]; scope: AccessScope; actorId: number }) {
  const db = await database();
  await db.transaction(async tx => {
    const now = Math.floor(Date.now() / 1000);
    const nameEn = `ACCOUNT_ACCESS_${input.userId}`;
    await tx.insert(roles).values({ nameEn, nameAr: `صلاحيات الحساب ${input.userId}`, description: "صلاحيات مخصصة للحساب", isSystem: 0, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { updatedAt: now } });
    const [role] = await tx.select().from(roles).where(eq(roles.nameEn, nameEn)).limit(1);
    if (!role) throw new Error("تعذر إعداد صلاحيات الحساب");
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    if (input.permissions.length) {
      const values = PERMISSION_CATALOG.filter(([code]) => input.permissions.includes(code)).map(([code, category, nameAr]) => ({ code, nameAr, nameEn: code, category, createdAt: now }));
      await tx.insert(permissions).values(values).onDuplicateKeyUpdate({ set: { createdAt: now } });
      const rows = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, input.permissions));
      await tx.insert(rolePermissions).values(rows.map(row => ({ roleId: role.id, permissionId: row.id })));
    }
    await tx.delete(userRoles).where(eq(userRoles.userId, input.userId));
    await tx.insert(userRoles).values({ userId: input.userId, roleId: role.id, assignedAt: now, assignedBy: input.actorId });
    await tx.delete(userAccessScopes).where(eq(userAccessScopes.userId, input.userId));
    if (input.scope !== null) await tx.insert(userAccessScopes).values({ userId: input.userId, costCenterIds: input.scope.costCenterIds });
  });
}

export async function assignAccessRoles(input: { userId: number; roleIds: number[]; scope: AccessScope; actorId: number }) {
  const db = await database();
  await db.transaction(async tx => {
    const ids = Array.from(new Set(input.roleIds));
    const existing = ids.length ? await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids)) : [];
    if (existing.length !== ids.length || !ids.length) throw new Error("اختر دورًا موجودًا واحدًا على الأقل؛ يمكن استخدام دور بلا صلاحيات لمنع جميع الإجراءات");
    await tx.delete(userRoles).where(eq(userRoles.userId, input.userId));
    await tx.insert(userRoles).values(ids.map(roleId => ({ userId: input.userId, roleId, assignedAt: Math.floor(Date.now() / 1000), assignedBy: input.actorId })));
    await tx.delete(userAccessScopes).where(eq(userAccessScopes.userId, input.userId));
    if (input.scope !== null) await tx.insert(userAccessScopes).values({ userId: input.userId, costCenterIds: input.scope.costCenterIds });
  });
}
