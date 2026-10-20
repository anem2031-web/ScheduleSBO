import { z } from "zod";
import { workerPhoneNumberSchema } from "../../../shared/worker-phone";

export const workerStatusSchema = z.enum([
  "active",
  "inactive",
  "on_leave",
  "terminated",
]);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const employeeIdSchema = z
  .string()
  .trim()
  .min(1, "الرقم الوظيفي مطلوب")
  .max(50, "الرقم الوظيفي يجب ألا يتجاوز 50 حرفًا")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "الرقم الوظيفي يقبل الحروف الإنجليزية والأرقام والشرطة فقط",
  )
  .transform((value) => value.toUpperCase());

export const fingerprintIdSchema = z
  .string()
  .trim()
  .max(50, "رقم البصمة يجب ألا يتجاوز 50 حرفًا")
  .optional()
  .transform((value) => value || undefined);

export const createWorkerSchema = z.object({
  employeeId: employeeIdSchema,
  fingerprintId: fingerprintIdSchema,
  phoneNumber: workerPhoneNumberSchema,
  nameAr: z.string().trim().min(2, "اسم العامل بالعربية مطلوب").max(255),
  nameEn: optionalTrimmed(255),
  nameUr: optionalTrimmed(255),
  nationality: optionalTrimmed(100),
  preferredLanguage: z.enum(["ar", "en", "ur", "hi", "bn", "ne", "fil"]).optional(),
  locationId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive(),
  jobTitleId: z.number().int().positive(),
  primarySupervisorId: z.number().int().positive().optional(),
  hireDate: z.union([z.string().date("تاريخ التعيين غير صحيح"), z.literal("").transform(() => null), z.null()]).optional(),
  status: workerStatusSchema.default("active"),
});

export const updateWorkerSchema = createWorkerSchema
  .omit({ employeeId: true })
  .partial()
  .extend({ id: z.number().int().positive() });

export const workerDutySettingsSchema = z.object({
  workerId: z.number().int().positive(),
  requiredDailyHours: z
    .number()
    .min(0.5, "أدخل ساعات يومية لا تقل عن نصف ساعة")
    .max(24, "الساعات اليومية لا تتجاوز 24 ساعة"),
  weeklyRestDay: z.number().int().min(0).max(6).nullable(),
  branch: z.string().trim().min(1).max(50).nullable(),
});
