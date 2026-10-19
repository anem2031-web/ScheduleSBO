import { describe, expect, it } from "vitest";
import { createWorkerSchema, employeeIdSchema, updateWorkerSchema } from "./workers.validation";
import { workerPhoneNumberSchema } from "../../../shared/worker-phone";

describe("worker identity validation", () => {
  it("normalizes the employee number", () => {
    expect(employeeIdSchema.parse(" emp-001 ")).toBe("EMP-001");
  });

  it("rejects empty or invalid employee numbers", () => {
    expect(() => employeeIdSchema.parse("   ")).toThrow();
    expect(() => employeeIdSchema.parse("EMP 001")).toThrow();
  });

  it("accepts a complete worker payload", () => {
    const result = createWorkerSchema.parse({
      employeeId: "emp_001",
      fingerprintId: " 1001 ",
      nameAr: "عامل اختبار",
      departmentId: 1,
      jobTitleId: 2,
      hireDate: "2026-07-20",
    });
    expect(result.employeeId).toBe("EMP_001");
    expect(result.fingerprintId).toBe("1001");
    expect(result.status).toBe("active");
  });
});

describe("worker phone validation", () => {
  it("keeps local leading zeroes and accepts international numbers from pasted Arabic/Persian digits", () => {
    expect(workerPhoneNumberSchema.parse("050 123 4567")).toBe("0501234567");
    expect(workerPhoneNumberSchema.parse(" +٩٦٦ (٥٠) ١٢٣-٤٥٦٧ ")).toBe("+966501234567");
    expect(workerPhoneNumberSchema.parse("۰۰۹۲ ۳۰۰-۱۲۳۴۵۶۷")).toBe("+923001234567");
    expect(workerPhoneNumberSchema.parse("+9779812345678")).toBe("+9779812345678");
  });

  it("leaves omitted phone untouched and supports explicitly clearing an existing phone", () => {
    expect(updateWorkerSchema.parse({ id: 1 })).not.toHaveProperty("phoneNumber");
    expect(updateWorkerSchema.parse({ id: 1, phoneNumber: "  " }).phoneNumber).toBeNull();
    expect(updateWorkerSchema.parse({ id: 1, phoneNumber: null }).phoneNumber).toBeNull();
    expect(updateWorkerSchema.parse({ id: 1, phoneNumber: "050-123-4567" }).phoneNumber).toBe("0501234567");
  });

  it("rejects incomplete numbers, letters, misplaced plus signs and extensions", () => {
    for (const phone of ["123456", "+1234567890123456", "050ABC4567", "050+1234567", "0501234567 ext 1", "050.123.4567"]) {
      const result = workerPhoneNumberSchema.safeParse(phone);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toContain("رقم هاتف");
    }
  });

  it("accepts existing create payloads without phone, and persists a supplied normalized phone", () => {
    const worker = { employeeId: "W-01", nameAr: "عامل جديد", departmentId: 1, jobTitleId: 2, hireDate: "2026-10-19" };
    expect(createWorkerSchema.parse(worker).phoneNumber).toBeUndefined();
    expect(createWorkerSchema.parse({ ...worker, phoneNumber: "00966 50 123 4567" }).phoneNumber).toBe("+966501234567");
  });
});
