import { workerPhoneNumberSchema } from "../../../shared/worker-phone";

export type WorkerImportRow = {
  employeeId: string;
  nameAr: string;
  fingerprintId?: string;
  phoneNumber?: string | null;
  error?: string;
};

/** CSV/TSV with quoted delimiters, escaped quotes and BOM, as exported by common office tools. */
export function parseWorkerImport(text: string): WorkerImportRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = source.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index++;
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("يوجد حقل نصي بعلامة اقتباس غير مغلقة في الملف.");
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  if (!records.length) throw new Error("الملف فارغ.");
  const headers = records.shift()!.map((value) => value.trim().toLowerCase());
  const employeeIndex = headers.findIndex((value) =>
    ["employeeid", "الرقم الوظيفي"].includes(value),
  );
  const nameIndex = headers.findIndex((value) =>
    ["namear", "الاسم", "الاسم بالعربية"].includes(value),
  );
  const fingerprintIndex = headers.findIndex((value) =>
    ["fingerprintid", "رقم البصمة"].includes(value),
  );
  const phoneIndex = headers.findIndex((value) =>
    ["phonenumber", "phone number", "phone", "mobile", "رقم الهاتف", "رقم الجوال", "الهاتف"].includes(value),
  );
  if (employeeIndex < 0 || nameIndex < 0)
    throw new Error(
      "يجب أن يحتوي الملف على عمودي: الرقم الوظيفي، الاسم بالعربية. حمّل القالب لتجهيز الأسماء.",
    );
  if (records.length > 500)
    throw new Error("ارفع حتى 500 عامل في المرة الواحدة.");
  const seenIds = new Set<string>(),
    seenFingerprints = new Set<string>();
  return records.map((values) => {
    const employeeId = (values[employeeIndex] ?? "").toUpperCase();
    const nameAr = values[nameIndex] ?? "";
    const fingerprintId =
      fingerprintIndex < 0 ? undefined : values[fingerprintIndex] || undefined;
    const phone = workerPhoneNumberSchema.safeParse(
      phoneIndex < 0 ? undefined : values[phoneIndex] ?? "",
    );
    let error: string | undefined;
    if (!/^[A-Z0-9_-]{1,50}$/.test(employeeId))
      error = "الرقم الوظيفي مطلوب ويقبل حروفًا إنجليزية وأرقامًا وشرطة فقط.";
    else if (seenIds.has(employeeId)) error = "الرقم الوظيفي مكرر داخل الملف.";
    else if (nameAr.length < 2 || nameAr.length > 255)
      error = "أدخل اسمًا بين خانتين و255 خانة.";
    else if (fingerprintId && fingerprintId.length > 50)
      error = "رقم البصمة يتجاوز 50 خانة.";
    else if (fingerprintId && seenFingerprints.has(fingerprintId))
      error = "رقم البصمة مكرر داخل الملف.";
    else if (!phone.success) error = phone.error.issues[0]?.message;
    seenIds.add(employeeId);
    if (fingerprintId) seenFingerprints.add(fingerprintId);
    return {
      employeeId,
      nameAr,
      fingerprintId,
      ...(phoneIndex >= 0 && phone.success ? { phoneNumber: phone.data } : {}),
      error,
    };
  });
}
