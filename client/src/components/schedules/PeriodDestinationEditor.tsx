import type { DirectInterval } from "@shared/weekly-schedule";
import { normalizeDigits } from "@shared/display-format";
import { Label } from "@/components/ui/label";
import { periodDestinationText, type DestinationCatalog, type UsualDestination } from "./period-destination";
import { useLanguage } from "@/lib/i18n";

export function PeriodDestinationEditor({ interval, worker, catalog, index, onChange }: {
  interval: DirectInterval;
  worker: UsualDestination;
  catalog: DestinationCatalog;
  index: number;
  onChange: (change: Partial<DirectInterval>) => void;
}) {
  const { language } = useLanguage();
  const text = (ar: string, en: string, ur: string) => ({ ar, en, ur })[language];
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
      <summary className="cursor-pointer leading-6">{text("مكان العمل والمهمة", "Workplace and task", "کام کی جگہ اور ذمہ داری")}: {normalizeDigits(periodDestinationText(interval, worker, catalog) || text("مكان العامل المعتاد", "Worker’s usual workplace", "کارکن کی معمول کی جگہ"))}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`period-center-${index}`}>{text("مركز تكلفة الفترة", "Shift cost center", "شفٹ کا لاگت مرکز")}</Label>
          <select id={`period-center-${index}`} className={selectClass} value={centerId ?? ""} onChange={(e) => {
            const costCenterId = Number(e.target.value) || undefined;
            const possibleSites = catalog.locations.filter((v) => catalog.branchLocations.some((link) => link.branchId === costCenterId && link.locationId === v.id));
            const siteId = possibleSites.length === 1 ? possibleSites[0].id : undefined;
            const possibleDepts = catalog.departments.filter((v) => catalog.locationDepartments.some((link) => link.locationId === siteId && link.departmentId === v.id));
            const deptId = possibleDepts.length === 1 ? possibleDepts[0].id : undefined;
            onChange({ costCenterId, locationId: siteId, departmentId: deptId, jobTitleId: uniqueJob(deptId) });
          }}>
            <option value="">{text("اختر المركز", "Select cost center", "لاگت مرکز منتخب کریں")}</option>
            {centerId && !catalog.centers.some((v) => v.id === centerId) && <option value={centerId}>{normalizeDigits(worker.costCenter ?? "المركز المعتاد")}</option>}
            {options(catalog.centers)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-location-${index}`}>{text("موقع الفترة", "Shift location", "شفٹ کا مقام")}</Label>
          <select id={`period-location-${index}`} className={selectClass} value={locationId ?? ""} onChange={(e) => {
            const nextLocation = Number(e.target.value) || undefined;
            const choices = catalog.departments.filter((v) => catalog.locationDepartments.some((link) => link.locationId === nextLocation && link.departmentId === v.id));
            const deptId = choices.length === 1 ? choices[0].id : undefined;
            onChange({ locationId: nextLocation, departmentId: deptId, jobTitleId: uniqueJob(deptId) });
          }}><option value="">{text("اختر الموقع", "Select location", "مقام منتخب کریں")}</option>{options(sites)}</select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-department-${index}`}>{text("قسم الفترة", "Shift department", "شفٹ کا شعبہ")}</Label>
          <select id={`period-department-${index}`} className={selectClass} value={departmentId ?? ""} onChange={(e) => {
            const nextDept = Number(e.target.value) || undefined;
            onChange({ departmentId: nextDept, jobTitleId: uniqueJob(nextDept) });
          }}><option value="">{text("اختر القسم", "Select department", "شعبہ منتخب کریں")}</option>{options(departments)}</select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`period-job-${index}`}>{text("مهمة / وظيفة الفترة", "Shift task / job", "شفٹ کا کام / عہدہ")}</Label>
          <select id={`period-job-${index}`} className={selectClass} value={jobTitleId === null ? "none" : jobTitleId ?? ""} onChange={(e) => onChange({ jobTitleId: e.target.value === "none" ? null : Number(e.target.value) || undefined })}>
            <option value="">{text("مهمة العامل المعتادة عند توافقها", "Worker’s usual task when applicable", "مناسب ہونے پر کارکن کا معمول کا کام")}</option>
            <option value="none">{text("بدون مهمة محددة", "No specific task", "کوئی خاص کام نہیں")}</option>
            {jobs.map((v) => <option key={v.id} value={v.id}>{normalizeDigits(v.titleAr)}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{text("تُستخدم بيانات العامل المعتادة تلقائيًا. اختر الجهة والمهمة هنا عند اختلاف هذه الفترة.", "The worker’s usual details are used automatically. Select a different workplace or task for this shift here.", "کارکن کی معمول کی تفصیلات خود استعمال ہوتی ہیں۔ اس شفٹ کے لیے مختلف جگہ یا کام یہاں منتخب کریں۔")}</p>
    </details>
  );
}
