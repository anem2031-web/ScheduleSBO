import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import superjson from "superjson";
import { createSessionToken } from "../server/modules/auth/auth.service";
import { COOKIE_NAME } from "../shared/const";
import { connect } from "./trial-database.mjs";

/** Live, authorized trial only: API mutations retain their audit trail; direct SQL is read-only. */
const root = path.resolve(".implementation-qa/full-trial-20261018");
const base = process.env.TRIAL_BASE_URL || "http://localhost:3110";
const stamp = `QA-ABS-${Date.now()}`;
const fixture = JSON.parse(await fs.readFile(path.join(root, "trial-workers.json"), "utf8"));
const seed = JSON.parse(await fs.readFile(path.join(root, "seed-summary.json"), "utf8"));
const from = seed.weeks[0];
const end = new Date(`${from}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
const to = end.toISOString().slice(0, 10);
const tokens = new Map<number, string>();
for (const id of [1, 2, 3, 10, 11, 12, 13, 20, 25]) tokens.set(id, await createSessionToken(id));
const db = await connect();
const results: { check: string; passed: boolean; detail?: unknown }[] = [];
const created = { leaves: [] as number[], overtime: [] as number[] };
const check = (name: string, passed: boolean, detail?: unknown) => results.push({ check: name, passed, ...(detail === undefined ? {} : { detail }) });
const assert = (name: string, passed: boolean, detail?: unknown) => { check(name, passed, detail); if (!passed) throw new Error(name); };
async function call(actor: number, procedure: string, input?: unknown, mutate = false) {
  const payload = JSON.stringify(superjson.serialize(input));
  const response = await fetch(`${base}/api/trpc/${procedure}${mutate ? "" : `?input=${encodeURIComponent(payload)}`}`, {
    method: mutate ? "POST" : "GET", headers: { cookie: `${COOKIE_NAME}=${tokens.get(actor)}`, ...(mutate ? { "content-type": "application/json" } : {}) }, ...(mutate ? { body: payload } : {}),
  });
  const body = await response.json();
  return { status: response.status, data: body.result?.data ? superjson.deserialize(body.result.data) as any : undefined, error: body.error?.json?.message ?? body.error?.message };
}
async function ok(actor: number, procedure: string, input?: unknown, mutate = false) {
  const answer = await call(actor, procedure, input, mutate);
  assert(`${procedure} succeeds for actor ${actor}`, answer.status === 200, answer.status === 200 ? undefined : answer);
  return answer.data;
}
async function denied(name: string, actor: number, procedure: string, input: unknown, expected = 403) {
  const answer = await call(actor, procedure, input, true); check(name, answer.status === expected, answer.status === expected ? undefined : answer);
}
async function rows(query: string, params: unknown[] = []) { return (await db.query(query, params))[0] as any[]; }
async function shifts(workerId: number) { return ok(1, "schedules.listAssignments", { workerId, fromDate: from, toDate: to, includeCancelled: true }); }
async function timeline(workerId: number, refDate: string) { return ok(1, "schedules.getWorkerTimeline", { workerId, refDate }); }
async function createLeave(workerId: number, kind: string, startDate: string, endDate: string, extra = {}) {
  // Repeated verification retires only this script's prior exact-range requests through the public workflow.
  const previous = await rows("SELECT id,status FROM requests WHERE workerId=? AND leaveKind=? AND startDate=? AND endDate=? AND reason LIKE 'QA-ABS-%' AND status IN ('pending','approved')", [workerId, kind, startDate, endDate]);
  for (const request of previous) await ok(request.status === "pending" ? 2 : 3, "leaves.cancel", { requestId: request.id, reason: `${stamp} superseded by repeat verification` }, true);
  const input = { workerId, leaveKind: kind, startDate, endDate, reason: `${stamp} ${kind}`, ...extra };
  const result = await ok(2, "leaves.create", input, true); created.leaves.push(result.id); return { input, id: result.id };
}
async function section(name: string, run: () => Promise<void>) { try { await run(); } catch (error) { check(`${name}: completed`, false, error instanceof Error ? error.message : String(error)); } }

try {
  const beforeCount = (await rows("SELECT COUNT(*) AS count FROM workers"))[0].count;
  assert("Trial starts with exactly 400 workers", Number(beforeCount) === 400);
  await section("Single-day sickness and cancellation", async () => {
    const workerId = 101, day = (await shifts(workerId)).find((a: any) => a.status === "planned").workDate.toISOString().slice(0, 10);
    const before = await timeline(workerId, day);
    const leave = await createLeave(workerId, "sick", day, day);
    const pending = await timeline(workerId, day);
    check("Pending sickness does not reduce required hours", pending.day.requiredMinutes === before.day.requiredMinutes);
    await ok(2, "leaves.update", { ...leave.input, requestId: leave.id, reason: `${stamp} pending sickness edited` }, true);
    await denied("HR editor cannot approve sickness", 2, "leaves.decide", { requestId: leave.id, approved: true });
    await denied("Supervisor cannot approve sickness", 12, "leaves.decide", { requestId: leave.id, approved: true });
    await ok(3, "leaves.decide", { requestId: leave.id, approved: true }, true);
    const after = await timeline(workerId, day);
    check("Approved one-day sickness zeroes required day hours", after.day.requiredMinutes === 0 && after.isOnLeaveToday);
    check("Sickness cancels planned work and retains cancelled history", (await shifts(workerId)).filter((a: any) => a.workDate.toISOString().slice(0,10) === day).every((a: any) => a.status === "cancelled"));
    await denied("Repeat sickness decision is rejected", 3, "leaves.decide", { requestId: leave.id, approved: true }, 409);
    await denied("Approved leave cannot be edited", 2, "leaves.update", { ...leave.input, requestId: leave.id }, 409);
    await ok(3, "leaves.cancel", { requestId: leave.id, reason: `${stamp} early return` }, true);
    const cancelled = await timeline(workerId, day);
    check("Cancellation restores hour requirement without silently restoring cancelled shifts", cancelled.day.requiredMinutes === before.day.requiredMinutes && cancelled.day.scheduledMinutes === 0 && !cancelled.isOnLeaveToday);
    await denied("Repeat cancellation is rejected", 3, "leaves.cancel", { requestId: leave.id, reason: `${stamp} repeat` }, 409);
  });
  await section("Multi-day sick leave", async () => {
    const leave = await createLeave(103, "sick", "2026-10-11", "2026-10-13");
    await ok(3, "leaves.decide", { requestId: leave.id, approved: true }, true);
    const entries = await rows("SELECT COUNT(*) AS count FROM worker_calendar WHERE requestId=?", [leave.id]);
    check("Three-day sickness writes three linked calendar days", Number(entries[0].count) === 3);
    const overlap = await call(2, "leaves.create", { ...leave.input, reason: `${stamp} overlapping` }, true);
    check("Overlapping approved sickness cannot be duplicated", overlap.status === 409);
  });
  await section("Annual 25 days crossing months", async () => {
    const leave = await createLeave(102, "annual", "2026-10-20", "2026-11-13");
    await ok(3, "leaves.decide", { requestId: leave.id, approved: true }, true);
    const entries = await rows("SELECT COUNT(*) AS count, MIN(date) AS firstDay, MAX(date) AS lastDay FROM worker_calendar WHERE requestId=?", [leave.id]);
    check("Annual leave includes all 25 civil dates across two months", Number(entries[0].count) === 25 && entries[0].firstDay === "2026-10-20" && entries[0].lastDay === "2026-11-13", entries[0]);
    for (const day of ["2026-10-20", "2026-11-01", "2026-11-13"]) { const view = await timeline(102, day); check(`Annual leave ${day}: zero day requirement`, view.day.requiredMinutes === 0 && view.isOnLeaveToday); }
    const list = await ok(12, "leaves.list", { fromDate: "2026-10-01", toDate: "2026-11-30" });
    check("Responsible supervisor sees the approved annual leave", list.items.some((item: any) => item.id === leave.id));
    const notifications = await rows("SELECT COUNT(*) AS count FROM notifications WHERE userId=12 AND message LIKE ?", [`%#${leave.id} %`]);
    check("Annual leave notifies responsible supervisor", Number(notifications[0].count) > 0);
  });
  await section("Rejected and pending requests", async () => {
    const leave = await createLeave(104, "sick", "2026-10-12", "2026-10-12");
    await denied("Rejection requires its reason", 3, "leaves.decide", { requestId: leave.id, approved: false }, 400);
    await ok(3, "leaves.decide", { requestId: leave.id, approved: false, decisionNote: `${stamp} invalid supporting reason` }, true);
    check("Rejected request creates no calendar absence", Number((await rows("SELECT COUNT(*) AS count FROM worker_calendar WHERE requestId=?", [leave.id]))[0].count) === 0);
    await denied("Rejected request cannot be approved later", 3, "leaves.decide", { requestId: leave.id, approved: true }, 409);
    const pending = await createLeave(104, "sick", "2026-10-13", "2026-10-13");
    await ok(2, "leaves.cancel", { requestId: pending.id, reason: `${stamp} author cancels pending` }, true);
    const outside = fixture.find((w: any) => w.centerId !== 1 && w.id > 150);
    await denied("HR editor cannot request leave outside restaurants", 2, "leaves.create", { ...pending.input, workerId: outside.id });
    await denied("Guard cannot create leave", 20, "leaves.create", pending.input);
  });
  for (const [workerId, mode] of [[106, "excused"], [107, "make_up"]] as const) await section(`Midnight permission ${mode}`, async () => {
    const assignment = (await shifts(workerId)).find((a: any) => a.status === "planned");
    const day = assignment.workDate.toISOString().slice(0, 10), before = await timeline(workerId, day);
    const leave = await createLeave(workerId, "permission", day, day, { startTime: "23:30", endTime: "00:30" });
    await denied("Permission approval requires explicit hour mode", 3, "leaves.decide", { requestId: leave.id, approved: true }, 400);
    await ok(3, "leaves.decide", { requestId: leave.id, approved: true, permissionMode: mode }, true);
    const after = await timeline(workerId, day);
    check(`${mode}: midnight hour remains on the start operational day`, after.permissionsToday.some((p: any) => p.id === leave.id && p.minutes === 60 && p.workDate === day && p.mode === mode));
    check(`${mode}: required hours follow its HR decision`, after.day.requiredMinutes === before.day.requiredMinutes - (mode === "excused" ? 60 : 0));
    check(`${mode}: original scheduled interval remains unchanged`, (await shifts(workerId)).find((a: any) => a.id === assignment.id)?.endTime === assignment.endTime);
  });
  await section("Planned extension two stages", async () => {
    const assignment = (await shifts(108)).find((a: any) => a.status === "planned" && a.endTime.slice(0, 5) === "01:30"), day = assignment.workDate.toISOString().slice(0, 10);
    const request = await ok(2, "overtime.create", { assignmentId: assignment.id, overtimeKind: "planned", endTime: "02:00", reason: `${stamp} planned 30m` }, true); created.overtime.push(request.id);
    check("HR-created planned extension awaits supervisor initial review", request.status === "pending" && request.reviewStatus === "pending");
    check("Creating planned request preserves official end time", (await shifts(108)).find((a: any) => a.id === assignment.id).endTime === assignment.endTime);
    await denied("HR final approval cannot skip supervisor review", 3, "overtime.decide", { id: request.id, approved: true, note: `${stamp} cannot skip` }, 409);
    await denied("Unrelated supervisor cannot review planned extension", 13, "overtime.review", { id: request.id, approved: true, note: `${stamp} wrong supervisor` });
    await ok(12, "overtime.review", { id: request.id, approved: true, note: `${stamp} preliminary review` }, true);
    check("Supervisor acceptance alone preserves official end time", (await shifts(108)).find((a: any) => a.id === assignment.id).endTime === assignment.endTime);
    await denied("HR editor cannot grant final overtime approval", 2, "overtime.decide", { id: request.id, approved: true, note: `${stamp} editor blocked` });
    await ok(3, "overtime.decide", { id: request.id, approved: true, note: `${stamp} final approval` }, true);
    const after = (await shifts(108)).find((a: any) => a.id === assignment.id);
    check("Only final approval extends official interval by 30m", after.endTime.slice(0,5) === "02:00" && after.plannedMinutes === assignment.plannedMinutes + 30);
    await denied("Repeat final approval is rejected", 3, "overtime.decide", { id: request.id, approved: true, note: `${stamp} repeat` }, 409);
    check("Planned midnight extension retains operational work date", after.workDate.toISOString().slice(0,10) === day);
  });
  await section("Actual overtime from seeded synthetic punches", async () => {
    const all = await ok(1, "overtime.list", { fromDate: from, toDate: to });
    const candidates = all.candidates.filter((c: any) => c.workerId >= 109 && c.workerId <= 150 && ![110,115,120,125,130,135,140,145,150].includes(c.workerId));
    assert("At least three untouched actual-overrun candidates exist", candidates.length >= 3, { count: candidates.length });
    for (const [index, candidate] of candidates.slice(0,3).entries()) {
      const originalPunch = (await rows("SELECT * FROM attendance WHERE id=?", [candidate.attendanceId]))[0];
      const assignment = (await shifts(candidate.workerId)).find((a: any) => a.id === candidate.assignmentId);
      const before = await timeline(candidate.workerId, candidate.workDate);
      const request = await ok(2, "overtime.create", { assignmentId: candidate.assignmentId, attendanceId: candidate.attendanceId, overtimeKind: "actual", reason: `${stamp} actual case ${index}` }, true); created.overtime.push(request.id);
      await ok(12, "overtime.review", { id: request.id, approved: index !== 0, note: `${stamp} supervisor case ${index}` }, true);
      if (index > 0) await ok(3, "overtime.decide", { id: request.id, approved: index === 2, note: `${stamp} HR case ${index}` }, true);
      const after = await timeline(candidate.workerId, candidate.workDate);
      check(`Actual case ${index}: approved hours ${index === 2 ? "include" : "exclude"} the overrun`, after.day.approvedMinutes === before.day.approvedMinutes + (index === 2 ? candidate.minutes : 0), { before: before.day.approvedMinutes, after: after.day.approvedMinutes, overtime: candidate.minutes });
      check(`Actual case ${index}: original punch is immutable`, JSON.stringify((await rows("SELECT * FROM attendance WHERE id=?", [candidate.attendanceId]))[0]) === JSON.stringify(originalPunch));
      check(`Actual case ${index}: official interval is immutable`, (await shifts(candidate.workerId)).find((a: any) => a.id === assignment.id).endTime === assignment.endTime);
      const duplicate = await call(2, "overtime.create", { assignmentId: candidate.assignmentId, attendanceId: candidate.attendanceId, overtimeKind: "actual", reason: `${stamp} duplicate` }, true);
      check(`Actual case ${index}: same punch cannot produce duplicate overtime`, duplicate.status === 409);
    }
  });
  await section("Regular attendance break deduction", async () => {
    const regular = await rows("SELECT a.workerId, a.attendanceDate, a.actualHours FROM attendance a INNER JOIN shift_assignments s ON s.workerId=a.workerId AND s.workDate=a.attendanceDate WHERE a.workerId BETWEEN 131 AND 149 AND a.workerId % 5 <> 0 AND a.status='present' AND a.checkOutTime IS NOT NULL AND a.actualHours=9.5 AND s.breakMinutes=30 LIMIT 1");
    assert("A regular 9.5h raw attendance with 30m break exists", regular.length === 1);
    const view = await timeline(regular[0].workerId, regular[0].attendanceDate);
    check("9.5 raw attendance hours yield 540 approved work minutes after one break", view.day.approvedMinutes === 540, { workerId: regular[0].workerId, approved: view.day.approvedMinutes });
  });
  check("Trial ends with exactly 400 workers", Number((await rows("SELECT COUNT(*) AS count FROM workers"))[0].count) === 400);
} finally {
  await db.end();
  const report = { passed: results.every(r => r.passed), checks: results.length, at: new Date().toISOString(), base, stamp, syntheticAttendance: true, created, results };
  await fs.writeFile(path.join(root, "absences-api-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, created, failed: results.filter(r => !r.passed) }));
  process.exitCode = report.passed ? 0 : 1;
}
