import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import superjson from "superjson";
import { createSessionToken } from "../server/modules/auth/auth.service";
import { operationalDate } from "../shared/operational-day";
import { COOKIE_NAME } from "../shared/const";
import { permits } from "../shared/access-control";
import { saturdayOf } from "../shared/weekly-schedule";

/** Read-only live API verification. Sessions are signed locally; tokens are never persisted. */
const root = path.resolve(".implementation-qa/full-trial-20261018");
const accounts = JSON.parse(await fs.readFile(path.join(root, "trial-accounts.json"), "utf8")) as Array<{ id: number; username: string; role: string }>;
const workers = JSON.parse(await fs.readFile(path.join(root, "trial-workers.json"), "utf8")) as Array<{ id: number; userId?: number | null; mask: number; centerId: number }>;
const base = process.env.TRIAL_BASE_URL || "http://localhost:3000";
const results: Array<{ check: string; passed: boolean; detail?: unknown }> = [];
const tokens = new Map<number, string>();
const principals = new Map<number, any>();
for (const account of accounts) tokens.set(account.id, await createSessionToken(account.id));
async function call(accountId: number | null, procedure: string, input?: unknown, mutation = false) {
  const headers: Record<string, string> = {};
  if (accountId !== null) headers.cookie = `${COOKIE_NAME}=${tokens.get(accountId)}`;
  const payload = JSON.stringify(superjson.serialize(input));
  const url = `${base}/api/trpc/${procedure}${mutation ? "" : `?input=${encodeURIComponent(payload)}`}`;
  if (mutation) headers["content-type"] = "application/json";
  const response = await fetch(url, { method: mutation ? "POST" : "GET", headers, ...(mutation ? { body: payload } : {}) });
  const body = await response.json();
  return { status: response.status, data: body.result?.data ? superjson.deserialize(body.result.data) as any : undefined, error: body.error?.json?.data?.code ?? body.error?.data?.code };
}
function check(name: string, pass: boolean, detail?: unknown) { results.push({ check: name, passed: pass, ...(detail === undefined ? {} : { detail }) }); }
try {
  const unauthorized = await call(null, "workers.listAll");
  check("Anonymous worker list is denied", unauthorized.status === 401, { status: unauthorized.status });
  for (const account of accounts) {
    const me = await call(account.id, "auth.me");
    principals.set(account.id, me.data);
    check(`${account.username}: active session exposes effective grants without password hash`, me.status === 200 && me.data?.id === account.id && Array.isArray(me.data?.permissions) && !("passwordHash" in me.data), { status: me.status, permissionCount: me.data?.permissions?.length, centerIds: me.data?.accessScope?.costCenterIds ?? null });
  }
  const expected = new Map<number, number[]>([[1, workers.map(worker => worker.id)], [2, workers.filter(worker => worker.centerId === 1).map(worker => worker.id)], [3, workers.map(worker => worker.id)]]);
  for (const [bit, accountId] of [10, 11, 12, 13].entries()) expected.set(accountId, workers.filter(worker => worker.mask & (1 << bit)).map(worker => worker.id));
  for (const [accountId, ids] of expected) {
    const account = accounts.find(row => row.id === accountId)!;
    const list = await call(accountId, "workers.listAll");
    const actual = Array.isArray(list.data) ? list.data.map((row: any) => row.id) : [];
    check(`${account.username}: worker list equals assigned scope`, list.status === 200 && actual.length === ids.length && actual.every((id: number) => ids.includes(id)), { status: list.status, actual: actual.length, expected: ids.length });
    const daily = await call(accountId, "operations.dailyOverview", { date: operationalDate() });
    const dailyIds = daily.data?.rows?.map((row: any) => row.id) ?? [];
    check(`${account.username}: daily overview equals assigned scope`, daily.status === 200 && dailyIds.length === ids.length && dailyIds.every((id: number) => ids.includes(id)), { status: daily.status, actual: dailyIds.length, expected: ids.length });
    const board = await call(accountId, "schedules.getWeeklyBoard", { weekStart: saturdayOf(operationalDate()) });
    const boardIds = board.data?.workers?.map((row: any) => row.id) ?? [];
    check(`${account.username}: weekly board equals assigned scope`, board.status === 200 && boardIds.length === ids.length && boardIds.every((id: number) => ids.includes(id)), { status: board.status, actual: boardIds.length, expected: ids.length });
  }
  for (const account of accounts.filter(account => !expected.has(account.id))) {
    const list = await call(account.id, "workers.listAll");
    const authorized = permits(principals.get(account.id)?.permissions ?? [], "workers:read");
    check(`${account.username}: all-worker listing obeys its effective read permission`, authorized ? list.status === 200 : list.status === 403, { status: list.status });
  }
  const centers = await call(2, "orgStructure.listBranches", {});
  check("HR01: organization list is restricted to restaurants", centers.status === 200 && centers.data?.length === 1 && centers.data[0].id === 1, { status: centers.status, count: centers.data?.length });
  for (const accountId of [2, 3, 10, 20, 21, 25]) {
    const denied = await call(accountId, "users.setAccess", { userId: 2147483000, permissions: [], scope: null }, true);
    check(`${accounts.find(row => row.id === accountId)?.username}: cannot delegate account privileges`, denied.status === 403, { status: denied.status });
  }
  const outside = workers.find(worker => worker.centerId !== 1)!;
  const blockedWorker = await call(2, "workers.getById", { id: outside.id });
  check("HR01: cannot inspect a worker outside restaurant scope", blockedWorker.status === 403, { status: blockedWorker.status });
  const ownWorkerId = principals.get(25)?.workerId;
  if (ownWorkerId) {
    const self = await call(25, "workers.getById", { id: ownWorkerId });
    check("Worker: can view linked personal card", self.status === 200 && self.data?.id === ownWorkerId, { status: self.status });
    const other = await call(25, "workers.getById", { id: workers.find(worker => worker.id !== ownWorkerId)!.id });
    check("Worker: cannot inspect another worker", other.status === 403, { status: other.status });
    for (const procedure of ["schedules.getWorkerCard", "schedules.getWorkerTimeline"]) {
      const selfSchedule = await call(25, procedure, { workerId: ownWorkerId, refDate: operationalDate() });
      check(`Worker: ${procedure} permits linked personal data`, selfSchedule.status === 200, { status: selfSchedule.status });
      const otherSchedule = await call(25, procedure, { workerId: workers.find(worker => worker.id !== ownWorkerId)!.id, refDate: operationalDate() });
      check(`Worker: ${procedure} denies another worker`, otherSchedule.status === 403, { status: otherSchedule.status });
    }
  } else check("Worker: account has an explicit worker-card link", false);
} catch (error) {
  check("API verification completed", false, error instanceof Error ? error.message : String(error));
}
const report = { passed: results.every(result => result.passed), checks: results.length, at: new Date().toISOString(), results };
await fs.writeFile(path.join(root, "access-api-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failed: results.filter(result => !result.passed) }));
process.exitCode = report.passed ? 0 : 1;
