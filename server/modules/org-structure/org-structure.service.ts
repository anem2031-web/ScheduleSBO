import { createAuditLog } from "../../shared/audit";
import * as repo from "./org-structure.repository";

/**
 * ============================================================================
 * Org Structure Service — مركز البيانات الأساسية (الفروع والمواقع والأقسام)
 * فرع <->> موقع <->> قسم — علاقات متعددة لمتعدد بقرار صاحب المشروع.
 * ============================================================================
 */

export class OrgStructureError extends Error {
  constructor(
    public code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "OrgStructureError";
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

function assertNames(nameAr: string, code: string) {
  if (!code.trim()) {
    throw new OrgStructureError("BAD_REQUEST", "الرمز مطلوب");
  }
  if (!nameAr.trim()) {
    throw new OrgStructureError("BAD_REQUEST", "الاسم العربي مطلوب");
  }
}

async function deleteWithReferenceCheck(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof repo.OrgDeletionConflict) {
      throw new OrgStructureError(
        "CONFLICT",
        "تعذر الحذف لأن العنصر لم يعد موجودًا أو أُضيفت إليه ارتباطات أو سجلات. حدّث الصفحة وراجع ارتباطاته ثم حاول مجددًا.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// الفروع
// ---------------------------------------------------------------------------

export async function createBranch(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  createdBy: number;
}) {
  assertNames(input.nameAr, input.code);
  const code = normalizeCode(input.code);
  const existing = await repo.findBranchByCode(code);
  if (existing) {
    throw new OrgStructureError("CONFLICT", `الرمز "${code}" مستخدم لفرع آخر`);
  }
  const id = await repo.insertBranch({
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn?.trim(),
  });
  await createAuditLog("branch", id, "create", input.createdBy, undefined, {
    code,
    nameAr: input.nameAr,
  });
  return repo.findBranchById(id);
}

export async function updateBranch(input: {
  branchId: number;
  nameAr?: string;
  nameEn?: string;
  isActive?: boolean;
  updatedBy: number;
}) {
  const branch = await repo.findBranchById(input.branchId);
  if (!branch) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الفرع #${input.branchId} غير موجود`,
    );
  }
  await repo.updateBranch(branch.id, {
    nameAr: input.nameAr?.trim() || branch.nameAr,
    nameEn: input.nameEn !== undefined ? input.nameEn?.trim() : branch.nameEn,
    isActive: input.isActive ?? branch.isActive,
  });
  await createAuditLog(
    "branch",
    branch.id,
    "update",
    input.updatedBy,
    { nameAr: branch.nameAr, isActive: branch.isActive },
    { nameAr: input.nameAr, isActive: input.isActive },
  );
  return repo.findBranchById(branch.id);
}

export async function deleteBranch(input: {
  branchId: number;
  deletedBy: number;
}) {
  const branch = await repo.findBranchById(input.branchId);
  if (!branch) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الفرع #${input.branchId} غير موجود`,
    );
  }
  const linkCount = await repo.countBranchLocationLinksByBranch(input.branchId);
  if (linkCount > 0) {
    throw new OrgStructureError(
      "CONFLICT",
      `لا يمكن حذف مركز التكلفة «${branch.nameAr}» لوجود ${linkCount} ارتباط بمواقع. احذف المواقع غير المستخدمة أو فك ارتباطها أولًا.`,
    );
  }
  const workerCount = await repo.countWorkersByBranch(branch);
  if (workerCount > 0) {
    throw new OrgStructureError(
      "CONFLICT",
      `لا يمكن حذف مركز التكلفة «${branch.nameAr}» لوجود ${workerCount} عامل مرتبط به. انقل ارتباط العمال أولًا.`,
    );
  }
  await deleteWithReferenceCheck(() => repo.deleteBranch(branch));
  await createAuditLog("branch", input.branchId, "delete", input.deletedBy, {
    code: branch.code,
    nameAr: branch.nameAr,
  });
  return { removed: true };
}

export const listBranches = repo.listBranches;

// ---------------------------------------------------------------------------
// المواقع
// ---------------------------------------------------------------------------

export async function createLocation(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  createdBy: number;
}) {
  assertNames(input.nameAr, input.code);
  const code = normalizeCode(input.code);
  const existing = await repo.findLocationByCode(code);
  if (existing) {
    throw new OrgStructureError("CONFLICT", `الرمز "${code}" مستخدم لموقع آخر`);
  }
  const id = await repo.insertLocation({
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn?.trim(),
  });
  await createAuditLog("location", id, "create", input.createdBy, undefined, {
    code,
    nameAr: input.nameAr,
  });
  return repo.findLocationById(id);
}

export async function updateLocation(input: {
  locationId: number;
  nameAr?: string;
  nameEn?: string;
  isActive?: boolean;
  updatedBy: number;
}) {
  const location = await repo.findLocationById(input.locationId);
  if (!location) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الموقع #${input.locationId} غير موجود`,
    );
  }
  await repo.updateLocation(location.id, {
    nameAr: input.nameAr?.trim() || location.nameAr,
    nameEn: input.nameEn !== undefined ? input.nameEn?.trim() : location.nameEn,
    isActive: input.isActive ?? location.isActive,
  });
  await createAuditLog(
    "location",
    location.id,
    "update",
    input.updatedBy,
    { nameAr: location.nameAr, isActive: location.isActive },
    { nameAr: input.nameAr, isActive: input.isActive },
  );
  return repo.findLocationById(location.id);
}

export async function deleteLocation(input: {
  locationId: number;
  contextBranchId?: number;
  deletedBy: number;
}) {
  const location = await repo.findLocationById(input.locationId);
  if (!location) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الموقع #${input.locationId} غير موجود`,
    );
  }
  const branchLinks = await repo.countBranchLocationLinksByLocation(
    input.locationId,
  );
  const deptLinks = await repo.countLocationDepartmentLinksByLocation(
    input.locationId,
  );
  const contextLink =
    input.contextBranchId === undefined
      ? null
      : await repo.findBranchLocationLink(
          input.contextBranchId,
          input.locationId,
        );
  const otherBranchLinks = branchLinks - (contextLink ? 1 : 0);
  if (otherBranchLinks > 0 || deptLinks > 0) {
    const parts: string[] = [];
    if (otherBranchLinks > 0)
      parts.push(`${otherBranchLinks} ارتباط بمراكز تكلفة أخرى`);
    if (deptLinks > 0) parts.push(`${deptLinks} ارتباط بأقسام`);
    throw new OrgStructureError(
      "CONFLICT",
      `لا يمكن حذف الموقع «${location.nameAr}» لوجود ${parts.join(" و")}. يمكنك فك ارتباطه بالمركز الحالي مع إبقائه محفوظًا، أو معالجة الارتباطات أولًا.`,
    );
  }
  await deleteWithReferenceCheck(() =>
    repo.deleteLocation(input.locationId, input.contextBranchId),
  );
  await createAuditLog(
    "location",
    input.locationId,
    "delete",
    input.deletedBy,
    {
      code: location.code,
      nameAr: location.nameAr,
      contextBranchId: input.contextBranchId,
    },
  );
  return { removed: true };
}

export const listLocations = repo.listLocations;

export async function createLocationInBranch(input: {
  branchId: number;
  code: string;
  nameAr: string;
  createdBy: number;
}) {
  assertNames(input.nameAr, input.code);
  const branch = await repo.findBranchById(input.branchId);
  if (!branch || !branch.isActive) {
    throw new OrgStructureError(
      "BAD_REQUEST",
      "اختر مركز تكلفة نشطًا قبل إضافة الموقع",
    );
  }
  const code = normalizeCode(input.code);
  if (await repo.findLocationByCode(code)) {
    throw new OrgStructureError(
      "CONFLICT",
      "رمز الموقع مستخدم. يمكنك ربط الموقع الموجود من نفس الشاشة",
    );
  }
  const result = await repo.insertLocationInBranch(
    { code, nameAr: input.nameAr.trim() },
    input.branchId,
  );
  await createAuditLog(
    "location",
    result.id,
    "create",
    input.createdBy,
    undefined,
    {
      code,
      nameAr: input.nameAr.trim(),
      branchId: input.branchId,
    },
  );
  return repo.findLocationById(result.id);
}

// ---------------------------------------------------------------------------
// الأقسام
// ---------------------------------------------------------------------------

export async function createDepartment(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  createdBy: number;
}) {
  assertNames(input.nameAr, input.code);
  const code = normalizeCode(input.code);
  const existing = await repo.findDepartmentByCode(code);
  if (existing) {
    throw new OrgStructureError("CONFLICT", `الرمز "${code}" مستخدم لقسم آخر`);
  }
  const id = await repo.insertDepartment({
    code,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn?.trim(),
  });
  await createAuditLog("department", id, "create", input.createdBy, undefined, {
    code,
    nameAr: input.nameAr,
  });
  return repo.findDepartmentById(id);
}

export async function updateDepartment(input: {
  departmentId: number;
  nameAr?: string;
  nameEn?: string;
  isActive?: boolean;
  updatedBy: number;
}) {
  const department = await repo.findDepartmentById(input.departmentId);
  if (!department) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `القسم #${input.departmentId} غير موجود`,
    );
  }
  await repo.updateDepartment(department.id, {
    nameAr: input.nameAr?.trim() || department.nameAr,
    nameEn:
      input.nameEn !== undefined ? input.nameEn?.trim() : department.nameEn,
    isActive: input.isActive ?? department.isActive,
  });
  await createAuditLog(
    "department",
    department.id,
    "update",
    input.updatedBy,
    { nameAr: department.nameAr, isActive: department.isActive },
    { nameAr: input.nameAr, isActive: input.isActive },
  );
  return repo.findDepartmentById(department.id);
}

export async function deleteDepartment(input: {
  departmentId: number;
  contextLocationId?: number;
  deletedBy: number;
}) {
  const department = await repo.findDepartmentById(input.departmentId);
  if (!department) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `القسم #${input.departmentId} غير موجود`,
    );
  }
  const locationLinks = await repo.countLocationDepartmentLinksByDepartment(
    input.departmentId,
  );
  const workerCount = await repo.countWorkersByDepartment(input.departmentId);
  const jobTitleCount = await repo.countJobTitlesByDepartment(
    input.departmentId,
  );
  const recordCount = await repo.countDepartmentRecords(input.departmentId);
  const contextLink =
    input.contextLocationId === undefined
      ? null
      : await repo.findLocationDepartmentLink(
          input.contextLocationId,
          input.departmentId,
        );
  const otherLocationLinks = locationLinks - (contextLink ? 1 : 0);
  if (
    otherLocationLinks > 0 ||
    workerCount > 0 ||
    jobTitleCount > 0 ||
    recordCount > 0
  ) {
    const parts: string[] = [];
    if (workerCount > 0) parts.push(`${workerCount} عامل`);
    if (jobTitleCount > 0) parts.push(`${jobTitleCount} مسمى وظيفي`);
    if (otherLocationLinks > 0)
      parts.push(`${otherLocationLinks} ارتباط بمواقع أخرى`);
    if (recordCount > 0)
      parts.push(`${recordCount} سجل جدول أو وردية أو تقييم أو حوافز أو رواتب`);
    throw new OrgStructureError(
      "CONFLICT",
      `لا يمكن حذف القسم "${department.nameAr}"، مرتبط به ${parts.join(" و")}. عدّل الارتباطات أولًا.`,
    );
  }
  await deleteWithReferenceCheck(() =>
    repo.deleteDepartment(input.departmentId, input.contextLocationId),
  );
  await createAuditLog(
    "department",
    input.departmentId,
    "delete",
    input.deletedBy,
    {
      code: department.code,
      nameAr: department.nameAr,
      contextLocationId: input.contextLocationId,
    },
  );
  return { removed: true };
}

export const listDepartments = repo.listDepartments;

export async function createDepartmentInLocation(input: {
  locationId: number;
  code: string;
  nameAr: string;
  createdBy: number;
}) {
  assertNames(input.nameAr, input.code);
  const location = await repo.findLocationById(input.locationId);
  if (!location || !location.isActive) {
    throw new OrgStructureError(
      "BAD_REQUEST",
      "اختر موقعًا نشطًا قبل إضافة القسم",
    );
  }
  const code = normalizeCode(input.code);
  if (await repo.findDepartmentByCode(code)) {
    throw new OrgStructureError(
      "CONFLICT",
      "رمز القسم مستخدم. يمكنك ربط القسم الموجود من نفس الشاشة",
    );
  }
  const result = await repo.insertDepartmentInLocation(
    { code, nameAr: input.nameAr.trim() },
    input.locationId,
  );
  await createAuditLog(
    "department",
    result.id,
    "create",
    input.createdBy,
    undefined,
    {
      code,
      nameAr: input.nameAr.trim(),
      locationId: input.locationId,
    },
  );
  return repo.findDepartmentById(result.id);
}

// ---------------------------------------------------------------------------
// الروابط: فرع <-> موقع
// ---------------------------------------------------------------------------

export async function linkBranchLocation(input: {
  branchId: number;
  locationId: number;
  linkedBy: number;
}) {
  const branch = await repo.findBranchById(input.branchId);
  if (!branch) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الفرع #${input.branchId} غير موجود`,
    );
  }
  const location = await repo.findLocationById(input.locationId);
  if (!location) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الموقع #${input.locationId} غير موجود`,
    );
  }
  const existing = await repo.findBranchLocationLink(
    input.branchId,
    input.locationId,
  );
  if (existing) return existing;

  const id = await repo.insertBranchLocationLink(
    input.branchId,
    input.locationId,
  );
  await createAuditLog(
    "branch_location",
    id,
    "create",
    input.linkedBy,
    undefined,
    {
      branchId: input.branchId,
      locationId: input.locationId,
    },
  );
  return { id, branchId: input.branchId, locationId: input.locationId };
}

export async function unlinkBranchLocation(input: {
  linkId: number;
  unlinkedBy: number;
}) {
  await repo.deleteBranchLocationLink(input.linkId);
  await createAuditLog(
    "branch_location",
    input.linkId,
    "delete",
    input.unlinkedBy,
    {
      linkId: input.linkId,
    },
  );
  return { removed: true };
}

export const listBranchLocationLinks = repo.listBranchLocationLinks;

// ---------------------------------------------------------------------------
// الروابط: موقع <-> قسم
// ---------------------------------------------------------------------------

export async function linkLocationDepartment(input: {
  locationId: number;
  departmentId: number;
  linkedBy: number;
}) {
  const location = await repo.findLocationById(input.locationId);
  if (!location) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `الموقع #${input.locationId} غير موجود`,
    );
  }
  const department = await repo.findDepartmentById(input.departmentId);
  if (!department) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `القسم #${input.departmentId} غير موجود`,
    );
  }
  const existing = await repo.findLocationDepartmentLink(
    input.locationId,
    input.departmentId,
  );
  if (existing) return existing;

  const id = await repo.insertLocationDepartmentLink(
    input.locationId,
    input.departmentId,
  );
  await createAuditLog(
    "location_department",
    id,
    "create",
    input.linkedBy,
    undefined,
    { locationId: input.locationId, departmentId: input.departmentId },
  );
  return { id, locationId: input.locationId, departmentId: input.departmentId };
}

export async function unlinkLocationDepartment(input: {
  linkId: number;
  unlinkedBy: number;
}) {
  await repo.deleteLocationDepartmentLink(input.linkId);
  await createAuditLog(
    "location_department",
    input.linkId,
    "delete",
    input.unlinkedBy,
    { linkId: input.linkId },
  );
  return { removed: true };
}

export const listLocationDepartmentLinks = repo.listLocationDepartmentLinks;

// ---------------------------------------------------------------------------
// المسميات الوظيفية
// ---------------------------------------------------------------------------

export async function createJobTitle(input: {
  code: string;
  titleAr: string;
  departmentId?: number;
  createdBy: number;
}) {
  assertNames(input.titleAr, input.code);
  const code = normalizeCode(input.code);
  const existing = await repo.findJobTitleByCode(code);
  if (existing) {
    throw new OrgStructureError(
      "CONFLICT",
      `الرمز "${code}" مستخدم لمسمى وظيفي آخر`,
    );
  }
  if (input.departmentId !== undefined) {
    const department = await repo.findDepartmentById(input.departmentId);
    if (!department) {
      throw new OrgStructureError(
        "NOT_FOUND",
        `القسم #${input.departmentId} غير موجود`,
      );
    }
  }
  const id = await repo.insertJobTitle({
    code,
    titleAr: input.titleAr.trim(),
    departmentId: input.departmentId,
    effectiveFrom: new Date(),
  });
  await createAuditLog("job_title", id, "create", input.createdBy, undefined, {
    code,
    titleAr: input.titleAr,
    departmentId: input.departmentId,
  });
  return repo.findJobTitleById(id);
}

export async function updateJobTitle(input: {
  jobTitleId: number;
  titleAr?: string;
  departmentId?: number;
  isActive?: boolean;
  updatedBy: number;
}) {
  const jobTitle = await repo.findJobTitleById(input.jobTitleId);
  if (!jobTitle) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `المسمى الوظيفي #${input.jobTitleId} غير موجود`,
    );
  }
  await repo.updateJobTitle(jobTitle.id, {
    titleAr: input.titleAr?.trim() || jobTitle.titleAr,
    departmentId:
      input.departmentId !== undefined
        ? input.departmentId
        : jobTitle.departmentId,
    isActive: input.isActive ?? jobTitle.isActive,
  });
  await createAuditLog(
    "job_title",
    jobTitle.id,
    "update",
    input.updatedBy,
    { titleAr: jobTitle.titleAr, isActive: jobTitle.isActive },
    { titleAr: input.titleAr, isActive: input.isActive },
  );
  return repo.findJobTitleById(jobTitle.id);
}

export async function deleteJobTitle(input: {
  jobTitleId: number;
  deletedBy: number;
}) {
  const jobTitle = await repo.findJobTitleById(input.jobTitleId);
  if (!jobTitle) {
    throw new OrgStructureError(
      "NOT_FOUND",
      `المسمى الوظيفي #${input.jobTitleId} غير موجود`,
    );
  }
  const workerCount = await repo.countWorkersByJobTitle(input.jobTitleId);
  if (workerCount > 0) {
    throw new OrgStructureError(
      "CONFLICT",
      `لا يمكن حذف المسمى الوظيفي "${jobTitle.titleAr}"، مرتبط به ${workerCount} عامل. غيّر مسماهم أولًا.`,
    );
  }
  await repo.deleteJobTitle(input.jobTitleId);
  await createAuditLog(
    "job_title",
    input.jobTitleId,
    "delete",
    input.deletedBy,
    {
      code: jobTitle.code,
      titleAr: jobTitle.titleAr,
    },
  );
  return { removed: true };
}

export const listJobTitles = repo.listJobTitles;
