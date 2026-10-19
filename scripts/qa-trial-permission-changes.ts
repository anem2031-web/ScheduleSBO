import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import superjson from "superjson";
import { createSessionToken } from "../server/modules/auth/auth.service";
import { COOKIE_NAME } from "../shared/const";
import { permits } from "../shared/access-control";

/** Changes only trial HR access, restores both snapshots in finally, and never writes a shift. */
const root = path.resolve(".implementation-qa/full-trial-20261018");
const base = process.env.TRIAL_BASE_URL || "http://localhost:3110";
const tokens = new Map<number, string>();
for (const id of [1, 2, 3]) tokens.set(id, await createSessionToken(id));
const checks: Array<{ check: string; passed: boolean; detail?: unknown }> = [];
const snapshots = new Map<number, any>();
let restored = false;
const add = (check: string, passed: boolean, detail?: unknown) => checks.push({ check, passed, ...(detail === undefined ? {} : { detail }) });
async function call(id: number, procedure: string, input?: unknown, mutation = false) {
  const payload = JSON.stringify(superjson.serialize(input));
  const response = await fetch(`${base}/api/trpc/${procedure}${mutation ? "" : `?input=${encodeURIComponent(payload)}`}`, {
    method: mutation ? "POST" : "GET",
    headers: { cookie: `${COOKIE_NAME}=${tokens.get(id)}`, ...(mutation ? { "content-type": "application/json" } : {}) },
    ...(mutation ? { body: payload } : {}),
  });
  const body = await response.json();
  return { status: response.status, data: body.result?.data ? superjson.deserialize(body.result.data) as any : undefined, error: body.error?.json?.data?.code };
}
async function assign(userId: number, roleIds: number[], scope: any = null) {
  const result = await call(1, "users.assignAccessRoles", { userId, roleIds, scope }, true);
  if (result.status !== 200) throw new Error(`Cannot assign trial access for ${userId}: ${result.status}`);
}
async function custom(userId: number, permissions: string[], scope: any = null) {
  const result = await call(1, "users.setAccess", { userId, permissions, scope }, true);
  if (result.status !== 200) throw new Error(`Cannot customize trial access for ${userId}: ${result.status}`);
}
const same = (a: string[] | number[], b: string[] | number[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
async function principal(id: number) { const result = await call(id, "auth.me"); if (result.status !== 200) throw new Error(`Session ${id} unavailable`); return result.data; }
try {
  for (const id of [2, 3]) {
    const result = await call(1, "users.accessSettings", { userId: id });
    if (result.status !== 200 || !result.data.roleIds.length) throw new Error("Cannot snapshot original HR roles");
    snapshots.set(id, result.data);
  }
  await fs.writeFile(path.join(root, "permission-api-original-snapshot.json"), JSON.stringify([...snapshots.values()], null, 2));
  const roles = await call(1, "users.listAccessRoles");
  const role = (name: string) => { const found = roles.data?.find((entry: any) => entry.nameEn === name); if (!found) throw new Error(`Missing ${name}`); return found; };
  const editor = role("HR_EDITOR"), approver = role("HR_APPROVER"), full = role("HR_FULL"), viewer = role("HR_VIEWER");

  await assign(2, [editor.id]); await assign(3, [approver.id]);
  const editMe = await principal(2), approveMe = await principal(3);
  add("Editor and approver have separate effective grants", permits(editMe.permissions, "schedule:update") && !permits(editMe.permissions, "schedule:approve") && permits(approveMe.permissions, "schedule:approve") && !permits(approveMe.permissions, "schedule:update"));
  const noPublish = await call(2, "schedules.publishPeriod", { periodId: 2147483000 }, true);
  add("Editor cannot publish even with a valid existing session", noPublish.status === 403, noPublish.status);
  const canPublish = await call(3, "schedules.publishPeriod", { periodId: 2147483000 }, true);
  add("Approver reaches period lookup after permission check without modifying a period", canPublish.status === 404, canPublish.status);

  for (const id of [2, 3]) await assign(id, [editor.id, approver.id]);
  for (const id of [2, 3]) {
    const me = await principal(id);
    add(`HR${id - 1}: shared roles combine editing and approval`, permits(me.permissions, "schedule:update") && permits(me.permissions, "schedule:approve") && new Set(me.permissions).size === me.permissions.length);
  }

  await assign(2, [full.id]); await custom(3, []);
  const owner = await principal(2), revoked = await principal(3);
  add("One HR account receives full operational HR authority", same(owner.permissions, full.permissions));
  add("Other HR account has exactly zero permissions instead of role defaults", Array.isArray(revoked.permissions) && revoked.permissions.length === 0, revoked.permissions?.length);
  const deniedList = await call(3, "workers.listAll");
  const deniedPublish = await call(3, "schedules.publishPeriod", { periodId: 2147483000 }, true);
  add("Revocation applies immediately to worker reading on the same session", deniedList.status === 403, deniedList.status);
  add("Revocation applies immediately to approval on the same session", deniedPublish.status === 403, deniedPublish.status);

  await assign(3, [full.id]); await custom(2, []);
  const transferred = await principal(3), former = await principal(2);
  add("Full HR authority transfers to the second account without signing in again", same(transferred.permissions, full.permissions) && former.permissions.length === 0);
  const restoredList = await call(3, "workers.listAll");
  add("Second HR session immediately gains worker reading", restoredList.status === 200 && restoredList.data.length === 400, { status: restoredList.status, count: restoredList.data?.length });

  await assign(2, [viewer.id], { costCenterIds: [] });
  const emptyScope = await call(2, "workers.listAll");
  add("Explicit empty center scope returns an empty worker list", emptyScope.status === 200 && emptyScope.data.length === 0, { status: emptyScope.status, count: emptyScope.data?.length });
  await assign(2, [viewer.id], { costCenterIds: [1] });
  await assign(3, [viewer.id], { costCenterIds: [3, 4] });
  const restaurant = await call(2, "workers.listAll"), workshop = await call(3, "workers.listAll");
  add("Separate HR scopes show restaurants and workshops independently", restaurant.status === 200 && workshop.status === 200 && restaurant.data.length > 0 && workshop.data.length > 0 && !restaurant.data.some((row: any) => workshop.data.some((other: any) => row.id === other.id)), { restaurants: restaurant.data?.length, workshops: workshop.data?.length });
  const viewerPublish = await call(2, "schedules.publishPeriod", { periodId: 2147483000 }, true);
  add("Read-only HR cannot approve schedules", viewerPublish.status === 403, viewerPublish.status);
  for (const id of [2, 3]) {
    const delegation = await call(id, "users.setAccess", { userId: id === 2 ? 3 : 2, permissions: [], scope: null }, true);
    add(`HR${id - 1}: cannot change another account's authority`, delegation.status === 403, delegation.status);
  }
  const adminBefore = await principal(1);
  for (const [procedure, input] of [["users.setAccess", { userId: 1, permissions: [], scope: null }], ["users.assignAccessRoles", { userId: 1, roleIds: [viewer.id], scope: { costCenterIds: [] } }]] as const) {
    const result = await call(1, procedure, input, true);
    add(`Administrator cannot be restricted by ${procedure}`, result.status === 400, result.status);
  }
  const adminAfter = await principal(1);
  add("Administrator retains full authority and unlimited scope", same(adminBefore.permissions, adminAfter.permissions) && adminAfter.accessScope === null);
} catch (error) {
  add("Permission mutation scenario completes", false, error instanceof Error ? error.message : String(error));
} finally {
  const restoration: boolean[] = [];
  for (const [id, snapshot] of snapshots) {
    try {
      await assign(id, snapshot.roleIds, snapshot.scope);
      const result = await call(1, "users.accessSettings", { userId: id });
      const ok = result.status === 200 && same(result.data.roleIds, snapshot.roleIds) && same(result.data.permissions, snapshot.permissions) && JSON.stringify(result.data.scope) === JSON.stringify(snapshot.scope);
      restoration.push(ok); add(`HR${id - 1}: original roles, grants, and scope restored`, ok);
    } catch (error) { restoration.push(false); add(`HR${id - 1}: restore original access`, false, String(error)); }
  }
  restored = snapshots.size === 2 && restoration.every(Boolean);
}
const report = { passed: checks.every(check => check.passed) && restored, checks: checks.length, restored, at: new Date().toISOString(), results: checks };
await fs.writeFile(path.join(root, "permission-api-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, restored, failed: checks.filter(check => !check.passed) }));
process.exitCode = report.passed ? 0 : 1;
