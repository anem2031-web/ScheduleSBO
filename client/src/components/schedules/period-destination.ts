import type { DirectInterval } from "@shared/weekly-schedule";
import { operationalClockMinutes } from "@shared/operational-day";

export type DestinationCatalog = {
  centers: { id: number; nameAr: string }[];
  locations: { id: number; nameAr: string }[];
  departments: { id: number; nameAr: string }[];
  jobTitles: { id: number; titleAr: string; departmentId?: number | null }[];
  branchLocations: { branchId: number; locationId: number }[];
  locationDepartments: { locationId: number; departmentId: number }[];
};
export type UsualDestination = {
  costCenterId?: number | null;
  locationId?: number | null;
  departmentId?: number | null;
  jobTitleId?: number | null;
  costCenter?: string;
  locationName?: string;
  departmentName?: string;
  jobTitleName?: string;
};
export const EMPTY_DESTINATIONS: DestinationCatalog = {
  centers: [], locations: [], departments: [], jobTitles: [], branchLocations: [], locationDepartments: [],
};

/** Keep work destination intact when editing or copying a stored shift. */
export function directPeriod(period: Pick<DirectInterval, "startTime" | "endTime" | "breakMinutes"> & UsualDestination): DirectInterval {
  return {
    startTime: period.startTime, endTime: period.endTime, breakMinutes: period.breakMinutes ?? 0,
    ...Object.fromEntries((["costCenterId", "locationId", "departmentId", "jobTitleId"] as const)
      .filter((key) => period[key] != null || (key === "jobTitleId" && period.jobTitleId === null)).map((key) => [key, period[key]])),
  };
}

export function periodDestinationText(period: UsualDestination, worker: UsualDestination, catalog: DestinationCatalog = EMPTY_DESTINATIONS) {
  const centerId = period.costCenterId ?? worker.costCenterId;
  const locationId = period.locationId ?? (centerId === worker.costCenterId ? worker.locationId : undefined);
  const departmentId = period.departmentId ?? (locationId === worker.locationId ? worker.departmentId : undefined);
  const usualJob = catalog.jobTitles.find((v) => v.id === worker.jobTitleId);
  const jobId = period.jobTitleId === null ? null : period.jobTitleId ?? (departmentId === worker.departmentId || (usualJob && usualJob.departmentId == null) ? worker.jobTitleId : undefined);
  const site = period.locationName ?? catalog.locations.find((v) => v.id === locationId)?.nameAr ??
    (locationId === worker.locationId ? worker.locationName : undefined);
  const department = period.departmentName ?? catalog.departments.find((v) => v.id === departmentId)?.nameAr ??
    (departmentId === worker.departmentId ? worker.departmentName : undefined);
  const task = period.jobTitleName ?? catalog.jobTitles.find((v) => v.id === jobId)?.titleAr ??
    (jobId === worker.jobTitleId ? worker.jobTitleName : undefined);
  const center = period.costCenter ?? catalog.centers.find((v) => v.id === centerId)?.nameAr ??
    (centerId === worker.costCenterId ? worker.costCenter : undefined);
  return Array.from(new Set([center, site, department, task].filter(Boolean))).join(" · ");
}

/** Clock labels follow the actual start, independently of column placement. */
export function periodTimeLabel(startTime: string) {
  const hour = Number(startTime.slice(0, 2));
  const minutes = hour * 60 + Number(startTime.slice(3, 5));
  return minutes < 270 ? "ليلاً" : hour < 12 ? "صباحًا" : hour < 16 ? "بعد الظهر" : "مساءً";
}

export function periodClockRange(startTime: string, endTime: string) {
  const minute = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const startIsNextDay = minute(startTime) < 270;
  const endIsNextDay = startIsNextDay || minute(endTime) < minute(startTime);
  return `${startTime}${startIsNextDay ? " (+1)" : ""}–${endTime}${endIsNextDay ? " (+1)" : ""}`;
}

export function chronologicalPeriodOrder(mine: { startTime: string }[], others: { startTime: string }[]) {
  return [
    ...mine.map((period, index) => ({ kind: "mine" as const, index, startTime: period.startTime })),
    ...others.map((period, index) => ({ kind: "other" as const, index, startTime: period.startTime })),
  ].sort((a, b) => operationalClockMinutes(a.startTime) - operationalClockMinutes(b.startTime));
}
