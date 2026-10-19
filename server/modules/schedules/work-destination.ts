import { TRPCError } from "@trpc/server";
import type { Branch, Location, Department, JobTitle, BranchLocation, LocationDepartment, Worker } from "../../../drizzle/schema";
import type { DirectInterval } from "../../../shared/weekly-schedule";
import * as rbac from "../../shared/rbac";

export type DestinationCatalog = {
  centers: Branch[]; locations: Location[]; departments: Department[]; jobTitles: JobTitle[];
  branchLocations: BranchLocation[]; locationDepartments: LocationDepartment[];
};
type WorkerPrimary = Pick<Worker, "id" | "departmentId" | "locationId" | "jobTitleId">;
export type WorkDestination = { costCenterId: number | null; locationId: number | null; departmentId: number | null; jobTitleId: number | null };
export const centerMatches = (center: Pick<Branch, "id" | "code" | "nameAr">, value: string | number | null | undefined) =>
  [String(center.id), center.code, center.nameAr].includes(String(value ?? ""));
export function primaryDestination(worker: WorkerPrimary, branch: string | null | undefined, catalog: DestinationCatalog): WorkDestination {
  const costCenterId = catalog.centers.find((center) => centerMatches(center, branch))?.id ?? null;
  const candidates = catalog.locations.filter((location) =>
    catalog.locationDepartments.some((link) => link.locationId === location.id && link.departmentId === worker.departmentId) &&
    (costCenterId == null || catalog.branchLocations.some((link) => link.branchId === costCenterId && link.locationId === location.id)));
  return { costCenterId, locationId: worker.locationId ?? (candidates.length === 1 ? candidates[0].id : null), departmentId: worker.departmentId, jobTitleId: worker.jobTitleId };
}
export function resolveDestination(interval: Partial<WorkDestination>, primary: WorkDestination): WorkDestination {
  return {
    costCenterId: interval.costCenterId ?? primary.costCenterId,
    locationId: interval.locationId ?? primary.locationId,
    departmentId: interval.departmentId ?? primary.departmentId,
    jobTitleId: interval.jobTitleId === undefined ? primary.jobTitleId : interval.jobTitleId,
  };
}
/** New rows snapshot the destination; an explicitly absent task must stay absent. */
export function resolveStoredDestination(stored: Partial<WorkDestination>, primary: WorkDestination): WorkDestination {
  const result = resolveDestination(stored, primary);
  if (stored.costCenterId == null && stored.locationId == null && stored.jobTitleId == null)
    result.jobTitleId = primary.jobTitleId;
  return result;
}
/** Validate the hierarchy and access before a single assignment is changed. */
export function validateWorkDestination(actor: Pick<rbac.AuthorizedUser, "role" | "accessScope">, interval: Partial<DirectInterval>, primary: WorkDestination, catalog: DestinationCatalog, workDate: string): WorkDestination {
  const result = resolveDestination(interval, primary);
  // Changing department does not silently carry an unrelated primary task.
  if (interval.jobTitleId === undefined && result.departmentId !== primary.departmentId) {
    const inherited = catalog.jobTitles.find((item) => item.id === result.jobTitleId);
    if (inherited?.departmentId != null && inherited.departmentId !== result.departmentId) result.jobTitleId = null;
  }
  const invalid = (message: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message }); };
  for (const id of Object.values(result)) if (id != null && (!Number.isSafeInteger(id) || id < 1)) invalid("اختر جهة عمل صحيحة للفترة");
  const center = catalog.centers.find((item) => item.id === result.costCenterId);
  const location = catalog.locations.find((item) => item.id === result.locationId);
  const department = catalog.departments.find((item) => item.id === result.departmentId);
  const job = catalog.jobTitles.find((item) => item.id === result.jobTitleId);
  if (!center?.isActive || !location?.isActive || !department?.isActive || (result.jobTitleId != null && !job?.isActive)) invalid("أكمل مركز التكلفة والموقع والقسم، واختر مهمة نشطة عند تحديدها");
  if (!rbac.isCostCenterAllowed(actor, result.costCenterId)) throw new TRPCError({ code: "FORBIDDEN", message: "جهة هذه الفترة خارج مراكز التكلفة المسموحة لك" });
  if (!catalog.branchLocations.some((link) => link.branchId === result.costCenterId && link.locationId === result.locationId)) invalid("الموقع غير مرتبط بمركز التكلفة المختار");
  if (!catalog.locationDepartments.some((link) => link.locationId === result.locationId && link.departmentId === result.departmentId)) invalid("القسم غير مرتبط بالموقع المختار");
  if (job?.departmentId != null && job.departmentId !== result.departmentId) invalid("المهمة غير مرتبطة بالقسم المختار");
  const day = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  if (job && (day(job.effectiveFrom) > workDate || (job.effectiveTo && day(job.effectiveTo) < workDate))) invalid("المهمة غير سارية في تاريخ هذه الفترة");
  return result;
}
export function destinationLabels(destination: WorkDestination, catalog: DestinationCatalog) {
  return { ...destination,
    costCenter: catalog.centers.find((item) => item.id === destination.costCenterId)?.nameAr ?? "مركز غير محدد",
    locationName: catalog.locations.find((item) => item.id === destination.locationId)?.nameAr ?? "موقع غير محدد",
    departmentName: catalog.departments.find((item) => item.id === destination.departmentId)?.nameAr ?? "قسم غير محدد",
    jobTitleName: catalog.jobTitles.find((item) => item.id === destination.jobTitleId)?.titleAr ?? "مهمة غير محددة",
  };
}
export function authorizedDestinations(actor: Pick<rbac.AuthorizedUser, "role" | "accessScope">, catalog: DestinationCatalog): DestinationCatalog {
  const centers = catalog.centers.filter((item) => item.isActive && rbac.isCostCenterAllowed(actor, item.id));
  const centerIds = new Set(centers.map((item) => item.id));
  const branchLocations = catalog.branchLocations.filter((item) => centerIds.has(item.branchId));
  const locationIds = new Set(branchLocations.map((item) => item.locationId));
  const locations = catalog.locations.filter((item) => item.isActive && locationIds.has(item.id));
  const activeLocationIds = new Set(locations.map((item) => item.id));
  const locationDepartments = catalog.locationDepartments.filter((item) => activeLocationIds.has(item.locationId));
  const departmentIds = new Set(locationDepartments.map((item) => item.departmentId));
  const departments = catalog.departments.filter((item) => item.isActive && departmentIds.has(item.id));
  const activeDepartmentIds = new Set(departments.map((item) => item.id));
  return { centers, locations, departments, jobTitles: catalog.jobTitles.filter((item) => item.isActive && (item.departmentId == null || activeDepartmentIds.has(item.departmentId))), branchLocations: branchLocations.filter((item) => activeLocationIds.has(item.locationId)), locationDepartments: locationDepartments.filter((item) => activeDepartmentIds.has(item.departmentId)) };
}
