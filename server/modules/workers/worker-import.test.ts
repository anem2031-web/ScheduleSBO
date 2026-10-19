import { describe, expect, it } from "vitest";
import { parseWorkerImport } from "../../../client/src/lib/worker-import";

describe("worker import", () => {
  it("accepts Arabic headers, BOM, quotes and leading-zero fingerprint IDs", () => {
    expect(
      parseWorkerImport(
        '\uFEFFالرقم الوظيفي,الاسم بالعربية,رقم البصمة\r\nw-01,"أحمد، محمد",0007\r\n',
      )[0],
    ).toEqual({
      employeeId: "W-01",
      nameAr: "أحمد، محمد",
      fingerprintId: "0007",
      error: undefined,
    });
    expect(
      parseWorkerImport('employeeId,nameAr\nW1,"أحمد, محمد"')[0].nameAr,
    ).toBe("أحمد, محمد");
  });
  it("flags duplicate employee and fingerprint numbers before sending any request", () => {
    const rows = parseWorkerImport(
      "employeeId\tnameAr\tfingerprintId\nw1\tأحمد\t01\nW1\tخالد\t02\nw3\tسعيد\t01",
    );
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toContain("الوظيفي مكرر");
    expect(rows[2].error).toContain("البصمة مكرر");
  });
  it("rejects malformed files and missing required columns", () => {
    expect(() => parseWorkerImport('employeeId,nameAr\nw1,"أحمد')).toThrow(
      "اقتباس",
    );
    expect(() => parseWorkerImport("الاسم\nأحمد")).toThrow("عمودي");
  });

  it("imports optional phone as text using Arabic or English headers", () => {
    const rows = parseWorkerImport(
      "الرقم الوظيفي,الاسم بالعربية,رقم الهاتف\nW1,أحمد,050 123 4567\nW2,خالد,٠٠٩٢ ٣٠٠-١٢٣٤٥٦٧\nW3,سعيد,",
    );
    expect(rows.map(row => row.phoneNumber)).toEqual(["0501234567", "+923001234567", null]);
    expect(rows.every(row => row.error === undefined)).toBe(true);
    expect(parseWorkerImport("employeeId,nameAr,phoneNumber\nW1,أحمد,+9779812345678")[0].phoneNumber).toBe("+9779812345678");
    expect(parseWorkerImport("employeeId,nameAr,phone\nW1,أحمد,0501234567")[0].phoneNumber).toBe("0501234567");
  });

  it("flags malformed phone before import while allowing workers to share a contact number", () => {
    const rows = parseWorkerImport(
      "employeeId,nameAr,phone\nW1,أحمد,0501234567\nW2,خالد,0501234567\nW3,سعيد,123\nW4,محمد,phone12345",
    );
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toBeUndefined();
    expect(rows[2].error).toContain("رقم هاتف");
    expect(rows[3].error).toContain("رقم هاتف");
    expect(parseWorkerImport("employeeId,nameAr\nW1,أحمد")[0]).not.toHaveProperty("phoneNumber");
  });
});
