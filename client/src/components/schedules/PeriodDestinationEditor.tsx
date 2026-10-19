import type { DirectInterval } from "@shared/weekly-schedule";
import { normalizeDigits } from "@shared/display-format";
import { Label } from "@/components/ui/label";
import { periodDestinationText, type DestinationCatalog, type UsualDestination } from "./period-destination";

export function PeriodDestinationEditor({ interval, worker, catalog, index, onChange }: {
  interval: DirectInterval;
  worker: UsualDestination;
  catalog: DestinationCatalog;
  index: number;
  onChange: (change: Partial<DirectInterval>) => void;
}) {
  const centerId = interval.costCenterId ?? worker.costCenterId;
  const permittedSiteIds = new Set(catalog.branchLocations.filter((v) => v.branchId === centerId).map((v) => v.locationId));
  const sites = catalog.locations.filter((v) => permittedSiteIds.has(v.id));
  const locationId = interval.locationId ?? (sites.some((v) => v.id === worker.locationId) ? worker.locationId : undefined);
  const permittedDeptIds = new Set(catalog.locationDepartments.filter((v) => v.locationId === locationId).map((v) => v.departmentId));
  const departments = catalog.departments.filter((v) => permittedDeptIds.has(v.id));
  const departmentId = interval.departmentId ?? (departments.some((v) => v.id === worker.departmentId) ? worker.departmentId : undefined);
  const jobs = catalog.jobTitles.filter((v) => !v.departmentId || v.departmentId === departmentId);
  const jobTitleId = interval.jobTitleId === null ? null : interval.jobTitleId ?? (jobs.some((v) => v.id === worker.jobTitleId) ? worker.jobTitleId : undefined);
  const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  const options = (items: {id:number;nameAr:string}[]) => items.map((v) => <option key={v.id} value={v.id}>{normalizeDigits(v.nameAr)}</option>);
  const uniqueJob = (dept?: number) => {
    const choices = catalog.jobTitles.filter((v) => !v.departmentId || v.departmentId === dept);
    return choices.length === 1 ? choices[0].id : undefined;
  };
  return (
    <details className="mt-3 rounded-md border bg-background p-3 text-sm">
      <summary className="cursor-pointer leading-6">مكان العمل والمهمة: {normalizeDigits(periodDestinationText(interval, worker, catalog) || "مكان العامل المعتاد")}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`period-center-${index}`}>مركز تكلفة الفترة</Label>
          <select id={`period-center-${index}`} className={selectClass} value={centerId ?? ""} onChange={(e) => {
            const costCenterId = Number(e.target.value) || undefined;
            const possibleSites = catalog.locations.filter((v) => catalog.branchLocations.some((link) => link.branchId === costCenterId && link.locationId === v.id));
            const siteId = possibleSites.length === 1 ? possibleSites[0].id : undefined;
            const possibleDepts = catalog.departments.filter((v) => catalog.locationDepartments.some((link) => link.locationId === siteId && link.departmentId === v.id));
            const deptId = possibleDepts.length === 1 ? possibleDepts[0].id : undefined;
            onChange({ costCenterId, locationId: siteId, departmentId: deptId, jobTitleId: uniqueJob(deptId) });
          }}>
            <option value="">اختر المركز</option>
            {centerId && !catalog.centers.some((v) => v.id === centerId) && <option value={centerId}>{normalizeDigits(worker.costCenter ?? "المركز المعتاد")}</option>}
            {options(catalog.centers)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-location-${index}`}>موقع الفترة</Label>
          <select id={`period-location-${index}`} className={selectClass} value={locationId ?? ""} onChange={(e) => {
            const nextLocation = Number(e.target.value) || undefined;
            const choices = catalog.departments.filter((v) => catalog.locationDepartments.some((link) => link.locationId === nextLocation && link.departmentId === v.id));
            const deptId = choices.length === 1 ? choices[0].id : undefined;
            onChange({ locationId: nextLocation, departmentId: deptId, jobTitleId: uniqueJob(deptId) });
          }}><option value="">اختر الموقع</option>{options(sites)}</select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-department-${index}`}>قسم الفترة</Label>
          <select id={`period-department-${index}`} className={selectClass} value={departmentId ?? ""} onChange={(e) => {
            const nextDept = Number(e.target.value) || undefined;
            onChange({ departmentId: nextDept, jobTitleId: uniqueJob(nextDept) });
          }}><option value="">اختر القسم</option>{options(departments)}</select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-job-${index}`}>مهمة / وظيفة الفترة</Label>
          <select id={`period-job-${index}`} className={selectClass} value={jobTitleId === null ? "none" : jobTitleId ?? ""} onChange={(e) => onChange({ jobTitleId: e.target.value === "none" ? null : Number(e.target.value) || undefined })}>
            <option value="">مهمة العامل المعتادة عند توافقها</option>
            <option value="none">بدون مهمة محددة</option>
            {jobs.map((v) => <option key={v.id} value={v.id}>{normalizeDigits(v.titleAr)}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">تُستخدم بيانات العامل المعتادة تلقائيًا. اختر الجهة والمهمة هنا عند اختلاف هذه الفترة.</p>
    </details>
  );
}
