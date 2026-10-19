import { z } from "zod";
import { normalizeDigits } from "./display-format";

/** A phone is text: retain local leading zeroes and an explicit country prefix. */
export function normalizeWorkerPhone(value: string): string {
  return normalizeDigits(value).trim().replace(/[\s()\-]/g, "").replace(/^00/, "+");
}

export const WORKER_PHONE_ERROR =
  "أدخل رقم هاتف من 7 إلى 15 رقمًا، ويمكن أن يبدأ بعلامة + ورمز الدولة، أو اترك الحقل فارغًا.";

/** Missing means unchanged on update; an empty field or null explicitly clears it. */
export const workerPhoneNumberSchema = z
  .string()
  .max(80, WORKER_PHONE_ERROR)
  .nullable()
  .optional()
  .transform((value) =>
    value === undefined ? undefined : value === null ? null : normalizeWorkerPhone(value) || null,
  )
  .refine((value) => value == null || /^\+?[0-9]{7,15}$/.test(value), WORKER_PHONE_ERROR);
