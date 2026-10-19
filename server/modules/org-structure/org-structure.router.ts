import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import * as rbac from "../../shared/rbac";
import * as orgService from "./org-structure.service";
import { OrgStructureError } from "./org-structure.service";
import { assertOrgLinkScope, assertOrgScope, orgScope } from "./org-access";

function toTRPC(e: unknown): never {
  if (e instanceof OrgStructureError) {
    const map = {
      NOT_FOUND: "NOT_FOUND",
      BAD_REQUEST: "BAD_REQUEST",
      CONFLICT: "CONFLICT",
    } as const;
    throw new TRPCError({ code: map[e.code], message: e.message });
  }
  throw e;
}

function requireRead(role: Parameters<typeof rbac.hasPermission>[0]) {
  if (!rbac.hasPermission(role, rbac.ORG_STRUCTURE_READ)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية عرض البيانات الأساسية",
    });
  }
}

function requireManage(role: Parameters<typeof rbac.hasPermission>[0]) {
  if (!rbac.hasPermission(role, rbac.ORG_STRUCTURE_MANAGE)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية تعديل البيانات الأساسية",
    });
  }
}

const codeStr = z.string().min(1).max(50);
const nameStr = z.string().min(1).max(255);

export const orgStructureRouter = router({
  // ===== الفروع =====
  listBranches: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireRead(ctx.user);
      const scope = await orgScope(ctx.user);
      return (await orgService.listBranches(input?.activeOnly)).filter(row => !scope || scope.branches.includes(row.id));
    }),

  createBranch: protectedProcedure
    .input(
      z.object({
        code: codeStr,
        nameAr: nameStr,
        nameEn: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "branches");
        return await orgService.createBranch({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateBranch: protectedProcedure
    .input(
      z.object({
        branchId: z.number().int().positive(),
        nameAr: nameStr.optional(),
        nameEn: z.string().max(255).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "branches", input.branchId);
        return await orgService.updateBranch({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  deleteBranch: protectedProcedure
    .input(z.object({ branchId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "branches", input.branchId);
        return await orgService.deleteBranch({
          ...input,
          deletedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // ===== المواقع =====
  listLocations: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireRead(ctx.user);
      const scope = await orgScope(ctx.user);
      return (await orgService.listLocations(input?.activeOnly)).filter(row => !scope || scope.locations.includes(row.id));
    }),

  createLocation: protectedProcedure
    .input(
      z.object({
        code: codeStr,
        nameAr: nameStr,
        nameEn: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "locations");
        return await orgService.createLocation({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  createLocationInBranch: protectedProcedure
    .input(
      z.object({
        branchId: z.number().int().positive(),
        code: codeStr,
        nameAr: nameStr,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "branches", input.branchId);
        return await orgService.createLocationInBranch({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        nameAr: nameStr.optional(),
        nameEn: z.string().max(255).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "locations", input.locationId);
        return await orgService.updateLocation({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  deleteLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        contextBranchId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "locations", input.locationId);
        if (input.contextBranchId) await assertOrgScope(ctx.user, "branches", input.contextBranchId);
        return await orgService.deleteLocation({
          ...input,
          deletedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // ===== الأقسام =====
  listDepartments: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireRead(ctx.user);
      const scope = await orgScope(ctx.user);
      return (await orgService.listDepartments(input?.activeOnly)).filter(row => !scope || scope.departments.includes(row.id));
    }),

  createDepartment: protectedProcedure
    .input(
      z.object({
        code: codeStr,
        nameAr: nameStr,
        nameEn: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "departments");
        return await orgService.createDepartment({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  createDepartmentInLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        code: codeStr,
        nameAr: nameStr,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "locations", input.locationId);
        return await orgService.createDepartmentInLocation({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateDepartment: protectedProcedure
    .input(
      z.object({
        departmentId: z.number().int().positive(),
        nameAr: nameStr.optional(),
        nameEn: z.string().max(255).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "departments", input.departmentId);
        return await orgService.updateDepartment({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  deleteDepartment: protectedProcedure
    .input(
      z.object({
        departmentId: z.number().int().positive(),
        contextLocationId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "departments", input.departmentId);
        if (input.contextLocationId) await assertOrgScope(ctx.user, "locations", input.contextLocationId);
        return await orgService.deleteDepartment({
          ...input,
          deletedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  // ===== روابط فرع <-> موقع =====
  listBranchLocationLinks: protectedProcedure.query(async ({ ctx }) => {
    requireRead(ctx.user);
    const scope = await orgScope(ctx.user);
    return (await orgService.listBranchLocationLinks()).filter(row => !scope || scope.branches.includes(row.branchId));
  }),

  linkBranchLocation: protectedProcedure
    .input(
      z.object({
        branchId: z.number().int().positive(),
        locationId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "branches", input.branchId);
        await assertOrgScope(ctx.user, "locations", input.locationId);
        return await orgService.linkBranchLocation({
          ...input,
          linkedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  unlinkBranchLocation: protectedProcedure
    .input(z.object({ linkId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      await assertOrgLinkScope(ctx.user, "branch", input.linkId);
      return orgService.unlinkBranchLocation({
        linkId: input.linkId,
        unlinkedBy: ctx.user.id,
      });
    }),

  // ===== روابط موقع <-> قسم =====
  listLocationDepartmentLinks: protectedProcedure.query(async ({ ctx }) => {
    requireRead(ctx.user);
    const scope = await orgScope(ctx.user);
    return (await orgService.listLocationDepartmentLinks()).filter(row => !scope || scope.locations.includes(row.locationId));
  }),

  linkLocationDepartment: protectedProcedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        departmentId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "locations", input.locationId);
        await assertOrgScope(ctx.user, "departments", input.departmentId);
        return await orgService.linkLocationDepartment({
          ...input,
          linkedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  unlinkLocationDepartment: protectedProcedure
    .input(z.object({ linkId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      await assertOrgLinkScope(ctx.user, "department", input.linkId);
      return orgService.unlinkLocationDepartment({
        linkId: input.linkId,
        unlinkedBy: ctx.user.id,
      });
    }),

  // ===== المسميات الوظيفية =====
  listJobTitles: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireRead(ctx.user);
      const scope = await orgScope(ctx.user);
      return (await orgService.listJobTitles(input?.activeOnly)).filter(row => !scope || scope.jobTitles.includes(row.id));
    }),

  createJobTitle: protectedProcedure
    .input(
      z.object({
        code: codeStr,
        titleAr: nameStr,
        departmentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "departments", input.departmentId);
        return await orgService.createJobTitle({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  updateJobTitle: protectedProcedure
    .input(
      z.object({
        jobTitleId: z.number().int().positive(),
        titleAr: nameStr.optional(),
        departmentId: z.number().int().positive().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "jobTitles", input.jobTitleId);
        if (input.departmentId) await assertOrgScope(ctx.user, "departments", input.departmentId);
        return await orgService.updateJobTitle({
          ...input,
          updatedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),

  deleteJobTitle: protectedProcedure
    .input(z.object({ jobTitleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireManage(ctx.user);
      try {
        await assertOrgScope(ctx.user, "jobTitles", input.jobTitleId);
        return await orgService.deleteJobTitle({
          ...input,
          deletedBy: ctx.user.id,
        });
      } catch (e) {
        toTRPC(e);
      }
    }),
});
