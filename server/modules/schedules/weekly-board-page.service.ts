import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  branches, branchLocations, dayTypes, departments, jobTitles, locationDepartments, locations, requests,
  schedulePeriods, shiftAssignments, supervisorAssignments, users, workerCalendar,
  workers, workerScheduleSettings,
} from "../../../drizzle/schema";
import { addCalendarDays, isCalendarDate, sundayOf } from "../../../shared/weekly-schedule";
import { getDb } from "../../shared/db";
import * as rbac from "../../shared/rbac";
import { approvedAbsencesForWorkers, type ApprovedAbsence } from "../leaves/approved-absence";
import { authorizedDestinations, centerMatches, destinationLabels, primaryDestination, resolveStoredDestination, type DestinationCatalog } from "./work-destination";
import { enrichAnnualLeaveCalendar } from "../leaves/annual-leave-display";

type Actor = Pick<rbac.AuthorizedUser, "id" | "role" | "permissions" | "accessScope">;
type CostCenter = Pick<typeof branches.$inferSelect, "id" | "code" | "nameAr">;
export type WeeklyBoardPageInput = {
  center?: string;
  search?: string;
  offset?: number;
  limit?: number;
  workerIds?: number[];
};
const blockingCodes = new Set([
  "EMERGENCY_LEAVE", "LEAVE", "ANNUAL_LEAVE", "SICK_LEAVE", "UNPAID_LEAVE",
  "REST", "REST_DAY", "WEEKLY_REST", "HOLIDAY", "PUBLIC_HOLIDAY",
]);
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const dateString = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const centerKeys = (center: CostCenter) => [String(center.id), center.code, center.nameAr];
const centerLabel = (value: string | null, centers: CostCenter[]) => centers.find((center) => centerKeys(center).includes(value ?? ""))?.nameAr ?? value ?? "مركز غير محدد";

export function normalizeWeeklyPage(input: WeeklyBoardPageInput = {}) {
  const offset = input.offset ?? 0, limit = input.limit ?? 32;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new TRPCError({ code: "BAD_REQUEST", message: "اختر عددًا من 1 إلى 100 عامل في الصفحة ورقم بداية صالحًا" });
  const search = input.search?.trim() ?? "", center = input.center?.trim() ?? "";
  if (search.length > 100 || center.length > 255)
    throw new TRPCError({ code: "BAD_REQUEST", message: "نص البحث أو اسم المركز أطول من المسموح" });
  if (input.workerIds !== undefined && (!Array.isArray(input.workerIds) || input.workerIds.length > 100 || input.workerIds.some((id) => !Number.isSafeInteger(id) || id < 1)))
    throw new TRPCError({ code: "BAD_REQUEST", message: "حدد حتى 100 رقم عامل صالح" });
  return { offset, limit, search, center, ...(input.workerIds === undefined ? {} : { workerIds: Array.from(new Set(input.workerIds)) }) };
}

/** The very same SQL scope is applied to counts, pages and metadata, before any weekly data is read. */
export function weeklyWorkerScopeCondition(actor: Actor, centers: CostCenter[], weekStart: string, weekEnd: string) {
  // Workers on leave stay visible so their V day counters can be followed across weeks.
  const clauses: SQL[] = [eq(workers.isActive, true), inArray(workers.status, ["active", "on_leave"])];
  if (actor.role !== "admin" && actor.accessScope != null) {
    const allowed = centers.filter((center) => actor.accessScope!.costCenterIds.includes(center.id)).flatMap(centerKeys);
    if (!allowed.length) clauses.push(sql`1 = 0`);
    else if (actor.role !== "supervisor") clauses.push(or(
      inArray(workerScheduleSettings.branch, allowed),
      sql`exists (select 1 from ${shiftAssignments} where ${shiftAssignments.workerId} = ${workers.id}
        and ${shiftAssignments.workDate} >= ${weekStart} and ${shiftAssignments.workDate} <= ${weekEnd}
        and ${shiftAssignments.status} in ('planned','confirmed','completed')
        and ${inArray(shiftAssignments.costCenterId, actor.accessScope!.costCenterIds)})`,
    )!);
  }
  if (actor.role === "supervisor") {
    clauses.push(sql`exists (select 1 from ${supervisorAssignments}
      where ${supervisorAssignments.workerId} = ${workers.id}
      and ${supervisorAssignments.supervisorId} = ${actor.id}
      and ${supervisorAssignments.effectiveFrom} <= ${weekEnd}
      and (${supervisorAssignments.effectiveTo} is null or ${supervisorAssignments.effectiveTo} >= ${weekStart}))`);
  } else if (actor.role === "worker") {
    clauses.push(eq(workers.userId, actor.id));
  }
  return and(...clauses)!;
}

export function weeklyWorkerFilterCondition(input: Pick<WeeklyBoardPageInput, "center" | "search" | "workerIds">, centers: CostCenter[], weekStart?: string, weekEnd?: string, mode: "planning" | "export" = "planning", includeLinkedCandidates = false) {
  const clauses: SQL[] = [];
  if (input.workerIds !== undefined)
    clauses.push(input.workerIds.length ? inArray(workers.id, input.workerIds) : sql`1 = 0`);
  // A supervisor's already-linked workers remain candidates for their first shift
  // in the selected authorized center. The separate SQL scope still enforces links.
  if (input.center && !(mode === "planning" && includeLinkedCandidates)) {
    const center = centers.find((item) => centerKeys(item).includes(input.center!));
    const primary = center ? inArray(workerScheduleSettings.branch, centerKeys(center)) : input.center === "مركز غير محدد" ? isNull(workerScheduleSettings.branch) : eq(workerScheduleSettings.branch, input.center);
    if (weekStart && weekEnd) {
      const matchingDestination = center ? or(eq(shiftAssignments.costCenterId, center.id), and(isNull(shiftAssignments.costCenterId), primary))! : and(isNull(shiftAssignments.costCenterId), primary)!;
      clauses.push(or(
        sql`exists (select 1 from ${shiftAssignments} where ${shiftAssignments.workerId} = ${workers.id}
          and ${shiftAssignments.workDate} >= ${weekStart} and ${shiftAssignments.workDate} <= ${weekEnd}
          and ${shiftAssignments.status} in ('planned','confirmed','completed') and ${matchingDestination})`,
        mode === "planning" ? primary : and(primary, sql`not exists (select 1 from ${shiftAssignments} where ${shiftAssignments.workerId} = ${workers.id}
          and ${shiftAssignments.workDate} >= ${weekStart} and ${shiftAssignments.workDate} <= ${weekEnd}
          and ${shiftAssignments.status} in ('planned','confirmed','completed'))`),
      )!);
    } else clauses.push(primary);
  }
  if (input.search) {
    // LOCATE treats %, _ and backslashes as literal text rather than SQL wildcard syntax.
    const search = input.search.toLowerCase();
    clauses.push(or(...[workers.nameAr, workers.nameEn, workers.nameUr, workers.employeeId, departments.nameAr].map((column) => sql`locate(${search}, lower(${column})) > 0`))!);
  }
  return clauses.length ? and(...clauses) : undefined;
}

export async function getWeeklyBoardPage(actor: Actor, weekStart: string, input: WeeklyBoardPageInput = {}) {
  return loadWeeklyBoard(actor, weekStart, input, false);
}
/** Legacy full-board read shares exactly the paged board's scope and destination resolution. */
export async function getWeeklyBoardComplete(actor: Actor, weekStart: string) {
  return loadWeeklyBoard(actor, weekStart, {}, true);
}

/** Explicit export is the only new path that loads an entire center. Paging and UI search never truncate it. */
export async function getWeeklyBoardExport(actor: Actor, weekStart: string, input: Pick<WeeklyBoardPageInput, "center"> = {}) {
  if (!rbac.hasPermission(actor, rbac.SCHEDULE_EXPORT))
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية تصدير الجدول الأسبوعي" });
  if (!input.center?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر مركز تكلفة واحدًا لتصدير جدوله" });
  return loadWeeklyBoard(actor, weekStart, { center: input.center.trim() }, true);
}

async function loadWeeklyBoard(actor: Actor, weekStart: string, input: WeeklyBoardPageInput, exporting: boolean) {
  if (!rbac.hasPermission(actor, rbac.SCHEDULE_READ))
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية عرض الجدول الأسبوعي" });
  if (!isCalendarDate(weekStart) || sundayOf(weekStart) !== weekStart)
    throw new TRPCError({ code: "BAD_REQUEST", message: "اختر أسبوعًا يبدأ يوم الأحد" });
  const options = normalizeWeeklyPage(input);
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const weekEnd = addCalendarDays(weekStart, 6);
  const orgBranches = await db.select().from(branches);
  if (exporting && options.center && !orgBranches.some((center) => centerMatches(center, options.center)))
    throw new TRPCError({ code: "BAD_REQUEST", message: "اختر مركز تكلفة موجودًا لتصدير الجدول" });
  if (options.center && actor.role !== "admin" && actor.accessScope != null) {
    const requestedCenter = orgBranches.find((center) => centerMatches(center, options.center));
    if (!requestedCenter || !rbac.isCostCenterAllowed(actor, requestedCenter.id))
      throw new TRPCError({ code: "FORBIDDEN", message: "مركز الجدول المطلوب خارج نطاق صلاحيات حسابك" });
  }
  const scope = weeklyWorkerScopeCondition(actor, orgBranches, weekStart, weekEnd);
  const filteredScope = and(scope, weeklyWorkerFilterCondition(options, orgBranches, weekStart, weekEnd, exporting ? "export" : "planning", !exporting && actor.role === "supervisor"));
  const workerQuery = db.select({ worker: workers, settings: workerScheduleSettings, departmentName: departments.nameAr })
    .from(workers)
    .leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id))
    .leftJoin(departments, eq(departments.id, workers.departmentId))
    .leftJoin(locations, eq(locations.id, workers.locationId))
    .where(filteredScope)
    .orderBy(workerScheduleSettings.branch, locations.nameAr, departments.nameAr, workers.nameAr, workers.id)
    .$dynamic();
  const [selectedWorkers, totals, centerRows, supervisors, periods] = await Promise.all([
    exporting ? workerQuery : workerQuery.limit(options.limit).offset(options.offset),
    db.select({ count: count() }).from(workers)
      .leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id))
      .leftJoin(departments, eq(departments.id, workers.departmentId)).where(filteredScope),
    db.selectDistinct({ branch: workerScheduleSettings.branch }).from(workers)
      .leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id)).where(scope),
    db.selectDistinct({ id: users.id, name: users.name, isActive: users.isActive }).from(supervisorAssignments)
      .innerJoin(workers, eq(workers.id, supervisorAssignments.workerId))
      .leftJoin(workerScheduleSettings, eq(workerScheduleSettings.workerId, workers.id))
      .innerJoin(users, eq(users.id, supervisorAssignments.supervisorId))
      .where(and(scope, lte(supervisorAssignments.effectiveFrom, date(weekEnd)), or(isNull(supervisorAssignments.effectiveTo), gte(supervisorAssignments.effectiveTo, date(weekStart)))))
      .orderBy(users.name, users.id),
    db.select().from(schedulePeriods).where(and(lte(schedulePeriods.startDate, date(weekEnd)), gte(schedulePeriods.endDate, date(weekStart)), ne(schedulePeriods.status, "cancelled"))),
  ]);
  const ids = selectedWorkers.map(({ worker }) => worker.id);
  const [links, assignments, calendar, orgLocations, orgBranchLocations, orgLocationDepartments, absences, orgDepartments, orgJobTitles] = await Promise.all([
    ids.length ?
    db.select({ link: supervisorAssignments, name: users.name, isActive: users.isActive }).from(supervisorAssignments)
      .innerJoin(users, eq(users.id, supervisorAssignments.supervisorId))
      .where(and(inArray(supervisorAssignments.workerId, ids), lte(supervisorAssignments.effectiveFrom, date(weekEnd)), or(isNull(supervisorAssignments.effectiveTo), gte(supervisorAssignments.effectiveTo, date(weekStart))))) : [],
    // Include all supervisors' periods for these workers so cross-center budgets and overlap checks stay correct.
    ids.length ? db.select().from(shiftAssignments).where(and(inArray(shiftAssignments.workerId, ids), gte(shiftAssignments.workDate, date(weekStart)), lte(shiftAssignments.workDate, date(weekEnd)), inArray(shiftAssignments.status, ["planned", "confirmed", "completed"]))) : [],
    ids.length ? db.select({ entry: workerCalendar, code: dayTypes.code, label: dayTypes.nameAr }).from(workerCalendar)
      .innerJoin(dayTypes, eq(dayTypes.id, workerCalendar.dayTypeId))
      .where(and(inArray(workerCalendar.workerId, ids), gte(workerCalendar.date, date(weekStart)), lte(workerCalendar.date, date(weekEnd)))) : [],
    db.select().from(locations), db.select().from(branchLocations), db.select().from(locationDepartments),
    ids.length ? approvedAbsencesForWorkers(ids, weekStart, weekEnd) : new Map<number, ApprovedAbsence>(),
    db.select().from(departments), db.select().from(jobTitles),
  ]);
  const catalog: DestinationCatalog = { centers: orgBranches, locations: orgLocations, departments: orgDepartments, jobTitles: orgJobTitles, branchLocations: orgBranchLocations, locationDepartments: orgLocationDepartments };
  const primariesByWorker = new Map(selectedWorkers.map(({ worker, settings }) => [worker.id, primaryDestination(worker, settings?.branch, catalog)]));
  const supervisorNames = new Map(links.map(({ link, name }) => [link.supervisorId, name]));
  const annualRequestIds = Array.from(new Set(calendar.filter((row) => row.code.toUpperCase() === "ANNUAL_LEAVE").map((row) => row.entry.requestId).filter((id): id is number => id != null)));
  const annualRequests = annualRequestIds.length ? await db.select().from(requests).where(and(inArray(requests.id, annualRequestIds), inArray(requests.workerId, ids), eq(requests.leaveKind, "annual"), eq(requests.status, "approved"))) : [];
  const enrichedCalendar = enrichAnnualLeaveCalendar(calendar.map(({ entry, code, label }) => ({ workerId: entry.workerId, requestId: entry.requestId, date: dateString(entry.date), code, label })), annualRequests);
  const linksByWorker = Map.groupBy(links, ({ link }) => link.workerId);
  const calendarByWorker = Map.groupBy(enrichedCalendar, (entry) => entry.workerId);
  const locationsById = new Map(orgLocations.map((location) => [location.id, location]));
  return {
    weekStart, weekEnd, periods,
    totalWorkers: Number(totals[0]?.count ?? 0),
    offset: exporting ? 0 : options.offset,
    limit: exporting ? ids.length : options.limit,
    centers: Array.from(new Set([...orgBranches.filter((item) => rbac.isCostCenterAllowed(actor, item.id)).map((item) => item.nameAr), ...centerRows.map(({ branch }) => centerLabel(branch, orgBranches)).filter((label) => actor.role === "admin" || actor.accessScope == null || orgBranches.some((center) => center.nameAr === label && actor.accessScope!.costCenterIds.includes(center.id)))])).sort((a, b) => a.localeCompare(b, "ar")),
    destinations: authorizedDestinations(actor, catalog),
    supervisors,
    workers: selectedWorkers.map(({ worker, settings, departmentName }) => {
      const center = orgBranches.find((item) => centerKeys(item).includes(settings?.branch ?? ""));
      const departmentLocations = orgLocationDepartments.filter((link) => link.departmentId === worker.departmentId).map((link) => link.locationId);
      const centerLocations = center ? orgBranchLocations.filter((link) => link.branchId === center.id).map((link) => link.locationId) : [];
      const inferredLocations = orgLocations.filter((site) => departmentLocations.includes(site.id) && (!center || centerLocations.includes(site.id)));
      const explicitLocation = worker.locationId ? locationsById.get(worker.locationId) : undefined;
      return {
        id: worker.id, employeeId: worker.employeeId, name: worker.nameAr,
        departmentId: worker.departmentId, departmentName: departmentName ?? "قسم غير محدد",
        costCenterId: center?.id ?? null, locationId: primariesByWorker.get(worker.id)!.locationId, jobTitleId: worker.jobTitleId,
        jobTitleName: orgJobTitles.find((item) => item.id === worker.jobTitleId)?.titleAr ?? "مهمة غير محددة",
        costCenter: centerLabel(settings?.branch ?? null, orgBranches),
        locationName: explicitLocation?.nameAr ?? (inferredLocations.length === 1 ? inferredLocations[0].nameAr : inferredLocations.length ? "مواقع متعددة — يلزم تحديد الموقع" : "موقع غير محدد"),
        requiredDailyMinutes: settings ? Math.round(Number(settings.requiredHoursPerDay) * 60) : null,
        weeklyRestDay: settings?.weeklyRestDay ?? null,
        permissions: absences.get(worker.id)?.permissions ?? [],
        supervisors: (linksByWorker.get(worker.id) ?? []).map(({ link, name, isActive }) => ({ id: link.supervisorId, name: name ?? `مشرف ${link.supervisorId}`, isActive, effectiveFrom: dateString(link.effectiveFrom), effectiveTo: link.effectiveTo ? dateString(link.effectiveTo) : null })),
        calendar: (calendarByWorker.get(worker.id) ?? []).filter((row) => blockingCodes.has(row.code.toUpperCase())).map((row) => ({ date: dateString(row.date), label: row.label, annualLeaveStartDate: row.annualLeaveStartDate, annualLeaveDay: row.annualLeaveDay })),
      };
    }),
    assignments: assignments.map((assignment) => {
      return { ...assignment, ...destinationLabels(resolveStoredDestination(assignment, primariesByWorker.get(assignment.workerId)!), catalog), supervisorName: supervisorNames.get(assignment.supervisorId) ?? `مشرف ${assignment.supervisorId}`, workDate: dateString(assignment.workDate), startTime: assignment.startTime.slice(0, 5), endTime: assignment.endTime.slice(0, 5) };
    }).filter((assignment) => !exporting || !options.center || (orgBranches.find((center) => centerMatches(center, options.center))?.id === assignment.costCenterId) || (options.center === "مركز غير محدد" && assignment.costCenterId == null)),
  };
}
