import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  date,
  time,
  json,
  longtext,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  primaryKey,
} from "drizzle-orm/mysql-core";

/**
 * ============================================================================
 * منصة إدارة القوى العاملة - نموذج البيانات الشامل
 * ============================================================================
 * 
 * التقويم التشغيلي:
 * - المنطقة الزمنية: Asia/Riyadh
 * - بداية الأسبوع: السبت
 * - نهاية الأسبوع: الجمعة
 * - بداية اليوم الوظيفي: 04:30:00 صباحاً
 * - نهاية اليوم الوظيفي: 04:29:59 صباح اليوم التالي، دون دقيقة مستثناة
 */

// ============================================================================
// 1. جداول إدارة المستخدمين والأدوار
// ============================================================================

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    username: varchar("username", { length: 64 }).unique(),
    loginMethod: varchar("loginMethod", { length: 64 }),
    passwordHash: text("passwordHash"),
    role: mysqlEnum("role", [
      "admin",
      "hr_admin",
      "supervisor",
      "guard",
      "worker",
      "financial_reviewer",
      "finance",
      "accounting_head",
      "modifier",
    ])
      .default("worker")
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    openIdIdx: index("openId_idx").on(table.openId),
    roleIdx: index("role_idx").on(table.role),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// 2. جداول البيانات الأساسية والمرجعية
// ============================================================================

/**
 * جدول الأقسام التشغيلية
 */
export const departments = mysqlTable(
  "departments",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    nameUr: varchar("nameUr", { length: 255 }),
    description: text("description"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: index("dept_code_idx").on(table.code),
  })
);

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;

// ============================================================================
// 1-ب. الهيكل التنظيمي: الفروع والمواقع (مركز البيانات الأساسية)
// فرع <->> موقع <->> قسم — علاقات متعددة لمتعدد (هجينة) بقرار صاحب المشروع
// ============================================================================

/** فرع/منشأة تابعة (تولان، الملقا، حديقة الوطن...) */
export const branches = mysqlTable(
  "branches",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: index("branch_code_idx").on(table.code),
  })
);

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

/** موقع عمل داخل فرع أو مشترك بين عدة فروع (مثل: مطبخ رئيسي) */
export const locations = mysqlTable(
  "locations",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: index("location_code_idx").on(table.code),
  })
);

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/** ربط الموقع بالفروع (موقع واحد قد يخدم أكثر من فرع) */
export const branchLocations = mysqlTable(
  "branch_locations",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branchId")
      .notNull()
      .references(() => branches.id),
    locationId: int("locationId")
      .notNull()
      .references(() => locations.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    branchIdx: index("branch_loc_branch_idx").on(table.branchId),
    locationIdx: index("branch_loc_location_idx").on(table.locationId),
    uniquePair: uniqueIndex("branch_loc_unique").on(
      table.branchId,
      table.locationId
    ),
  })
);

export type BranchLocation = typeof branchLocations.$inferSelect;
export type InsertBranchLocation = typeof branchLocations.$inferInsert;

/** ربط القسم بالمواقع (نفس القسم قد يتكرر في أكثر من موقع) */
export const locationDepartments = mysqlTable(
  "location_departments",
  {
    id: int("id").autoincrement().primaryKey(),
    locationId: int("locationId")
      .notNull()
      .references(() => locations.id),
    departmentId: int("departmentId")
      .notNull()
      .references(() => departments.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    locationIdx: index("loc_dept_location_idx").on(table.locationId),
    departmentIdx: index("loc_dept_department_idx").on(table.departmentId),
    uniquePair: uniqueIndex("loc_dept_unique").on(
      table.locationId,
      table.departmentId
    ),
  })
);

export type LocationDepartment = typeof locationDepartments.$inferSelect;
export type InsertLocationDepartment = typeof locationDepartments.$inferInsert;

/**
 * جدول الوظائف والفئات
 */
export const jobTitles = mysqlTable(
  "job_titles",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    titleAr: varchar("titleAr", { length: 255 }).notNull(),
    titleEn: varchar("titleEn", { length: 255 }),
    titleUr: varchar("titleUr", { length: 255 }),
    departmentId: int("departmentId"),
    effectiveFrom: date("effectiveFrom").notNull(),
    effectiveTo: date("effectiveTo"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: index("job_code_idx").on(table.code),
    deptIdx: index("job_dept_idx").on(table.departmentId),
  })
);

export type JobTitle = typeof jobTitles.$inferSelect;
export type InsertJobTitle = typeof jobTitles.$inferInsert;

/**
 * جدول أنواع الأيام (إجازات، أيام رسمية، إلخ)
 */
export const dayTypes = mysqlTable(
  "day_types",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    nameUr: varchar("nameUr", { length: 255 }),
    description: text("description"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index("daytype_code_idx").on(table.code),
  })
);

export type DayType = typeof dayTypes.$inferSelect;
export type InsertDayType = typeof dayTypes.$inferInsert;

/**
 * جدول أسباب الدوام الإضافي
 */
export const overtimeReasons = mysqlTable(
  "overtime_reasons",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    reasonAr: varchar("reasonAr", { length: 255 }).notNull(),
    reasonEn: varchar("reasonEn", { length: 255 }),
    reasonUr: varchar("reasonUr", { length: 255 }),
    description: text("description"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index("overtime_reason_code_idx").on(table.code),
  })
);

export type OvertimeReason = typeof overtimeReasons.$inferSelect;
export type InsertOvertimeReason = typeof overtimeReasons.$inferInsert;

// ============================================================================
// 3. جداول العمال والموظفين
// ============================================================================

/**
 * جدول العمال - الكيان المركزي للنظام
 */
export const workers = mysqlTable(
  "workers",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: varchar("employeeId", { length: 50 }).notNull().unique(),
    fingerprintId: varchar("fingerprintId", { length: 50 }).unique(),
    phoneNumber: varchar("phoneNumber", { length: 32 }),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    nameUr: varchar("nameUr", { length: 255 }),
    nationality: varchar("nationality", { length: 100 }),
    preferredLanguage: varchar("preferredLanguage", { length: 10 }).default("ar").notNull(),
    locationId: int("locationId").references(() => locations.id),
    userId: int("userId").unique().references(() => users.id),
    jobTitleId: int("jobTitleId").notNull(),
    departmentId: int("departmentId").notNull(),
    primarySupervisorId: int("primarySupervisorId"),
    hireDate: date("hireDate").notNull(),
    status: mysqlEnum("status", ["active", "inactive", "on_leave", "terminated"])
      .default("active")
      .notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    employeeIdIdx: index("worker_employee_id_idx").on(table.employeeId),
    fingerprintIdx: index("worker_fingerprint_idx").on(table.fingerprintId),
    deptIdx: index("worker_dept_idx").on(table.departmentId),
    supervisorIdx: index("worker_supervisor_idx").on(table.primarySupervisorId),
  })
);

export type Worker = typeof workers.$inferSelect;
export type InsertWorker = typeof workers.$inferInsert;

/**
 * جدول بيانات الأجر للعامل
 * يحفظ نسخة تاريخية من الرواتب لكل عامل
 */
export const workerSalaries = mysqlTable(
  "worker_salaries",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    baseSalary: decimal("baseSalary", { precision: 12, scale: 2 }).notNull(),
    totalSalary: decimal("totalSalary", { precision: 12, scale: 2 }).notNull(),
    effectiveFrom: date("effectiveFrom").notNull(),
    effectiveTo: date("effectiveTo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    createdBy: int("createdBy"),
  },
  (table) => ({
    workerIdx: index("salary_worker_idx").on(table.workerId),
    effectiveIdx: index("salary_effective_idx").on(table.effectiveFrom),
  })
);

export type WorkerSalary = typeof workerSalaries.$inferSelect;
export type InsertWorkerSalary = typeof workerSalaries.$inferInsert;

/**
 * جدول إعدادات الدوام للعامل
 */
export const workerScheduleSettings = mysqlTable(
  "worker_schedule_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull().unique(),
    requiredHoursPerDay: decimal("requiredHoursPerDay", {
      precision: 5,
      scale: 2,
    }).notNull(),
    standardMonthlyHours: decimal("standardMonthlyHours", {
      precision: 7,
      scale: 2,
    }).notNull(),
    maxDailyHours: decimal("maxDailyHours", { precision: 5, scale: 2 }).notNull(),
    allowedShifts: json("allowedShifts"),
    // --- بطاقة الدوام (WORKER_CARD_SPEC §3) ---
    branch: varchar("branch", { length: 50 }),
    weeklyRestDay: int("weeklyRestDay"), // 0=الأحد .. 6=السبت
    patternType: mysqlEnum("patternType", ["single", "split"]).default("single"),
    p1Start: time("p1Start"),
    p1End: time("p1End"),
    p2Start: time("p2Start"),
    p2End: time("p2End"),
    /** استثناءات الأيام: { "4": {p1Start,p1End,p2Start?,p2End?}, "5": {...} } — المفتاح 0-6 */
    dayOverrides: json("dayOverrides"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerIdx: index("schedule_settings_worker_idx").on(table.workerId),
  })
);

export type WorkerScheduleSettings = typeof workerScheduleSettings.$inferSelect;
export type InsertWorkerScheduleSettings = typeof workerScheduleSettings.$inferInsert;

/**
 * جدول العلاقات الإدارية بين المشرفين والعمال
 */
export const supervisorAssignments = mysqlTable(
  "supervisor_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    supervisorId: int("supervisorId").notNull(),
    assignmentType: mysqlEnum("assignmentType", [
      "primary",
      "secondary",
      "temporary",
    ])
      .default("primary")
      .notNull(),
    effectiveFrom: date("effectiveFrom").notNull(),
    effectiveTo: date("effectiveTo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workerIdx: index("supervisor_assign_worker_idx").on(table.workerId),
    supervisorIdx: index("supervisor_assign_supervisor_idx").on(
      table.supervisorId
    ),
  })
);

export type SupervisorAssignment = typeof supervisorAssignments.$inferSelect;
export type InsertSupervisorAssignment = typeof supervisorAssignments.$inferInsert;

// ============================================================================
// 4. جداول التقويم والجداول الزمنية
// ============================================================================

/**
 * جدول التقويم الشخصي للعامل (إجازات، أيام رسمية، إلخ)
 */
export const workerCalendar = mysqlTable(
  "worker_calendar",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    date: date("date").notNull(),
    dayTypeId: int("dayTypeId").notNull(),
    reason: text("reason"),
    requestId: int("requestId"),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workerDateIdx: index("calendar_worker_date_idx").on(
      table.workerId,
      table.date
    ),
    dayTypeIdx: index("calendar_daytype_idx").on(table.dayTypeId),
  })
);

export type WorkerCalendar = typeof workerCalendar.$inferSelect;
export type InsertWorkerCalendar = typeof workerCalendar.$inferInsert;

/**
 * جدول الجداول الأسبوعية
 */
export const schedules = mysqlTable(
  "schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    scheduleCode: varchar("scheduleCode", { length: 100 }).notNull().unique(),
    departmentId: int("departmentId").notNull(),
    weekStartDate: date("weekStartDate").notNull(),
    weekEndDate: date("weekEndDate").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "published",
      "locked",
      "archived",
    ])
      .default("draft")
      .notNull(),
    createdBy: int("createdBy").notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scheduleCodeIdx: index("schedule_code_idx").on(table.scheduleCode),
    deptIdx: index("schedule_dept_idx").on(table.departmentId),
    weekIdx: index("schedule_week_idx").on(table.weekStartDate),
  })
);

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

/**
 * جدول الورديات (الحجوزات الزمنية للعمال)
 */
export const shifts = mysqlTable(
  "shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    scheduleId: int("scheduleId").notNull(),
    workerId: int("workerId").notNull(),
    shiftDate: date("shiftDate").notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    plannedHours: decimal("plannedHours", { precision: 5, scale: 2 }).notNull(),
    shiftType: mysqlEnum("shiftType", [
      "morning",
      "afternoon",
      "evening",
      "night",
      "custom",
    ])
      .default("custom")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scheduleIdx: index("shift_schedule_idx").on(table.scheduleId),
    workerIdx: index("shift_worker_idx").on(table.workerId),
    dateIdx: index("shift_date_idx").on(table.shiftDate),
  })
);

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

// ============================================================================
// 5. جداول الحضور والانصراف
// ============================================================================

/**
 * جدول تسجيل الحضور والانصراف
 * يتم التعامل معه كسجل غير قابل للحذف
 */
export const attendance = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    attendanceDate: date("attendanceDate").notNull(),
    checkInTime: timestamp("checkInTime"),
    checkOutTime: timestamp("checkOutTime"),
    actualHours: decimal("actualHours", { precision: 5, scale: 2 }),
    status: mysqlEnum("status", [
      "present",
      "absent",
      "late",
      "early_leave",
      "overtime",
      "excused",
    ])
      .default("present")
      .notNull(),
    notes: text("notes"),
    recordedBy: int("recordedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerDateIdx: index("attendance_worker_date_idx").on(
      table.workerId,
      table.attendanceDate
    ),
    statusIdx: index("attendance_status_idx").on(table.status),
  })
);

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

/**
 * جدول تصحيحات الحضور
 */
export const attendanceCorrections = mysqlTable(
  "attendance_corrections",
  {
    id: int("id").autoincrement().primaryKey(),
    attendanceId: int("attendanceId").notNull(),
    originalCheckIn: timestamp("originalCheckIn"),
    originalCheckOut: timestamp("originalCheckOut"),
    correctedCheckIn: timestamp("correctedCheckIn"),
    correctedCheckOut: timestamp("correctedCheckOut"),
    reason: text("reason").notNull(),
    correctedBy: int("correctedBy").notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    attendanceIdx: index("correction_attendance_idx").on(table.attendanceId),
  })
);

export type AttendanceCorrection = typeof attendanceCorrections.$inferSelect;
export type InsertAttendanceCorrection = typeof attendanceCorrections.$inferInsert;

// ============================================================================
// 6. جداول التقييم
// ============================================================================

/**
 * جدول نماذج التقييم
 */
export const evaluationTemplates = mysqlTable(
  "evaluation_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    nameUr: varchar("nameUr", { length: 255 }),
    departmentId: int("departmentId"),
    evaluationType: mysqlEnum("evaluationType", [
      "daily",
      "weekly",
      "monthly",
    ])
      .notNull(),
    criteria: json("criteria").notNull(),
    version: int("version").default(1).notNull(),
    effectiveFrom: date("effectiveFrom").notNull(),
    effectiveTo: date("effectiveTo"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: index("eval_template_code_idx").on(table.code),
    deptIdx: index("eval_template_dept_idx").on(table.departmentId),
  })
);

export type EvaluationTemplate = typeof evaluationTemplates.$inferSelect;
export type InsertEvaluationTemplate = typeof evaluationTemplates.$inferInsert;

/**
 * جدول التقييمات
 */
export const evaluations = mysqlTable(
  "evaluations",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    templateId: int("templateId").notNull(),
    evaluationDate: date("evaluationDate").notNull(),
    evaluationType: mysqlEnum("evaluationType", [
      "daily",
      "weekly",
      "monthly",
    ])
      .notNull(),
    scores: json("scores").notNull(),
    totalScore: decimal("totalScore", { precision: 5, scale: 2 }).notNull(),
    notes: text("notes"),
    evaluatedBy: int("evaluatedBy").notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    status: mysqlEnum("status", [
      "draft",
      "submitted",
      "approved",
      "rejected",
    ])
      .default("draft")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerIdx: index("evaluation_worker_idx").on(table.workerId),
    templateIdx: index("evaluation_template_idx").on(table.templateId),
    dateIdx: index("evaluation_date_idx").on(table.evaluationDate),
  })
);

export type Evaluation = typeof evaluations.$inferSelect;
export type InsertEvaluation = typeof evaluations.$inferInsert;

// ============================================================================
// 7. جداول الحوافز والمكافآت
// ============================================================================

/**
 * جدول فئات الحوافز
 */
export const incentiveCategories = mysqlTable(
  "incentive_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }),
    nameUr: varchar("nameUr", { length: 255 }),
    departmentId: int("departmentId"),
    description: text("description"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index("incentive_cat_code_idx").on(table.code),
    deptIdx: index("incentive_cat_dept_idx").on(table.departmentId),
  })
);

export type IncentiveCategory = typeof incentiveCategories.$inferSelect;
export type InsertIncentiveCategory = typeof incentiveCategories.$inferInsert;

/**
 * جدول قواعد الحوافز (شرائح، نسب، معادلات)
 * يحفظ نسخة تاريخية من القواعد
 */
export const incentiveRules = mysqlTable(
  "incentive_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    categoryId: int("categoryId").notNull(),
    ruleCode: varchar("ruleCode", { length: 100 }).notNull(),
    ruleDefinition: json("ruleDefinition").notNull(),
    version: int("version").default(1).notNull(),
    effectiveFrom: date("effectiveFrom").notNull(),
    effectiveTo: date("effectiveTo"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("rule_category_idx").on(table.categoryId),
    ruleCodeIdx: index("rule_code_idx").on(table.ruleCode),
  })
);

export type IncentiveRule = typeof incentiveRules.$inferSelect;
export type InsertIncentiveRule = typeof incentiveRules.$inferInsert;

/**
 * جدول الحوافز المحسوبة
 */
export const incentives = mysqlTable(
  "incentives",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    categoryId: int("categoryId").notNull(),
    periodStart: date("periodStart").notNull(),
    periodEnd: date("periodEnd").notNull(),
    baseAmount: decimal("baseAmount", { precision: 12, scale: 2 }).notNull(),
    bonusAmount: decimal("bonusAmount", { precision: 12, scale: 2 }).default("0"),
    deductionAmount: decimal("deductionAmount", { precision: 12, scale: 2 }).default("0"),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
    calculationDetails: json("calculationDetails"),
    calculatedBy: int("calculatedBy").notNull(),
    calculatedAt: timestamp("calculatedAt").notNull(),
    status: mysqlEnum("status", [
      "calculated",
      "approved",
      "rejected",
      "paid",
    ])
      .default("calculated")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerIdx: index("incentive_worker_idx").on(table.workerId),
    categoryIdx: index("incentive_category_idx").on(table.categoryId),
    periodIdx: index("incentive_period_idx").on(table.periodStart),
  })
);

export type Incentive = typeof incentives.$inferSelect;
export type InsertIncentive = typeof incentives.$inferInsert;

/**
 * جدول الدوام الإضافي
 */
export const overtimes = mysqlTable(
  "overtimes",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    overtimeKind: mysqlEnum("overtimeKind", ["planned", "actual"]).default("actual").notNull(),
    assignmentId: int("assignmentId"),
    attendanceId: int("attendanceId"),
    requestedBy: int("requestedBy"),
    requestedStartTime: time("requestedStartTime"),
    requestedEndTime: time("requestedEndTime"),
    originalEndTime: time("originalEndTime"),
    reasonText: text("reasonText"),
    reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
    reviewedBy: int("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    reviewNote: text("reviewNote"),
    decisionNote: text("decisionNote"),
    overtimeDate: date("overtimeDate").notNull(),
    hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
    reasonId: int("reasonId").notNull(),
    hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "paid",
    ])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workerIdx: index("overtime_worker_idx").on(table.workerId),
    dateIdx: index("overtime_date_idx").on(table.overtimeDate),
  })
);

export type Overtime = typeof overtimes.$inferSelect;
export type InsertOvertime = typeof overtimes.$inferInsert;

// ============================================================================
// 8. جداول الاعتمادات والصرف
// ============================================================================

/**
 * جدول كشوف المستحقات الشهرية
 */
export const payrollSheets = mysqlTable(
  "payroll_sheets",
  {
    id: int("id").autoincrement().primaryKey(),
    payrollCode: varchar("payrollCode", { length: 100 }).notNull().unique(),
    periodStart: date("periodStart").notNull(),
    periodEnd: date("periodEnd").notNull(),
    departmentId: int("departmentId"),
    totalWorkers: int("totalWorkers").notNull(),
    totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "hr_approved",
      "financial_reviewed",
      "accounting_approved",
      "paid",
      "archived",
    ])
      .default("draft")
      .notNull(),
    hrApprovedBy: int("hrApprovedBy"),
    hrApprovedAt: timestamp("hrApprovedAt"),
    financialReviewedBy: int("financialReviewedBy"),
    financialReviewedAt: timestamp("financialReviewedAt"),
    accountingApprovedBy: int("accountingApprovedBy"),
    accountingApprovedAt: timestamp("accountingApprovedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    payrollCodeIdx: index("payroll_code_idx").on(table.payrollCode),
    periodIdx: index("payroll_period_idx").on(table.periodStart),
  })
);

export type PayrollSheet = typeof payrollSheets.$inferSelect;
export type InsertPayrollSheet = typeof payrollSheets.$inferInsert;

/**
 * جدول تفاصيل المستحقات لكل عامل
 */
export const payrollDetails = mysqlTable(
  "payroll_details",
  {
    id: int("id").autoincrement().primaryKey(),
    payrollSheetId: int("payrollSheetId").notNull(),
    workerId: int("workerId").notNull(),
    baseSalary: decimal("baseSalary", { precision: 12, scale: 2 }).notNull(),
    incentives: decimal("incentives", { precision: 12, scale: 2 }).default("0"),
    overtimeAmount: decimal("overtimeAmount", { precision: 12, scale: 2 }).default("0"),
    deductions: decimal("deductions", { precision: 12, scale: 2 }).default("0"),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    payrollIdx: index("payroll_detail_payroll_idx").on(table.payrollSheetId),
    workerIdx: index("payroll_detail_worker_idx").on(table.workerId),
  })
);

export type PayrollDetail = typeof payrollDetails.$inferSelect;
export type InsertPayrollDetail = typeof payrollDetails.$inferInsert;

// ============================================================================
// 9. جداول الطلبات والتبريرات
// ============================================================================

/**
 * جدول الطلبات (إجازات، تبريرات، إلخ)
 */
export const requests = mysqlTable(
  "requests",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId").notNull(),
    requestType: mysqlEnum("requestType", [
      "leave",
      "justification",
      "correction",
      "exception",
    ])
      .notNull(),
    requestDate: date("requestDate").notNull(),
    leaveKind: mysqlEnum("leaveKind", ["sick", "annual", "permission"]),
    startDate: date("startDate"),
    endDate: date("endDate"),
    startTime: varchar("startTime", { length: 5 }),
    endTime: varchar("endTime", { length: 5 }),
    permissionMode: mysqlEnum("permissionMode", ["excused", "make_up"]),
    decisionNote: text("decisionNote"),
    cancelledBy: int("cancelledBy"),
    cancelledAt: timestamp("cancelledAt"),
    reason: text("reason").notNull(),
    attachments: json("attachments"),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ])
      .default("pending")
      .notNull(),
    submittedBy: int("submittedBy").notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerIdx: index("request_worker_idx").on(table.workerId),
    typeIdx: index("request_type_idx").on(table.requestType),
  })
);

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

// ============================================================================
// 10. جداول الإشعارات والمهام الدورية
// ============================================================================

/**
 * جدول الإشعارات
 */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: mysqlEnum("type", [
      "info",
      "warning",
      "error",
      "success",
    ])
      .default("info")
      .notNull(),
    actionUrl: varchar("actionUrl", { length: 500 }),
    isRead: boolean("isRead").default(false).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("notification_user_idx").on(table.userId),
    readIdx: index("notification_read_idx").on(table.isRead),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * جدول سجل العمليات والتدقيق
 * سجل غير قابل للحذف لكل تعديل في النظام
 */
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    entityType: varchar("entityType", { length: 100 }).notNull(),
    entityId: int("entityId").notNull(),
    action: mysqlEnum("action", [
      "create",
      "update",
      "delete",
      "approve",
      "reject",
    ])
      .notNull(),
    oldValues: json("oldValues"),
    newValues: json("newValues"),
    reason: text("reason"),
    referenceDocument: varchar("referenceDocument", { length: 500 }),
    performedBy: int("performedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index("audit_entity_idx").on(table.entityType),
    userIdx: index("audit_user_idx").on(table.performedBy),
    dateIdx: index("audit_date_idx").on(table.createdAt),
  })
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ============================================================================
// 11. جداول الترجمة والتعدد اللغوي
// ============================================================================

/**
 * جدول الترجمات المخزنة
 * يحفظ ترجمات جميع الحقول القابلة للترجمة
 */
export const translations = mysqlTable(
  "translations",
  {
    id: int("id").autoincrement().primaryKey(),
    entityType: varchar("entityType", { length: 100 }).notNull(),
    entityId: int("entityId").notNull(),
    fieldName: varchar("fieldName", { length: 100 }).notNull(),
    language: mysqlEnum("language", ["ar", "en", "ur"]).notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    entityIdx: index("translation_entity_idx").on(table.entityType),
    languageIdx: index("translation_language_idx").on(table.language),
  })
);

export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = typeof translations.$inferInsert;

// ============================================================================
// 12. جداول الإعدادات والتكوين
// ============================================================================

/**
 * جدول الإعدادات العامة للنظام
 */
export const systemSettings = mysqlTable(
  "system_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    settingKey: varchar("settingKey", { length: 100 }).notNull().unique(),
    settingValue: longtext("settingValue").notNull(),
    description: text("description"),
    dataType: mysqlEnum("dataType", [
      "string",
      "number",
      "boolean",
      "json",
    ])
      .default("string")
      .notNull(),
    updatedBy: int("updatedBy"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    keyIdx: index("setting_key_idx").on(table.settingKey),
  })
);

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * جدول فترات العمل (للإقفال اليومي والأسبوعي والشهري)
 */
export const operatingPeriods = mysqlTable(
  "operating_periods",
  {
    id: int("id").autoincrement().primaryKey(),
    periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly"])
      .notNull(),
    periodDate: date("periodDate").notNull(),
    isLocked: boolean("isLocked").default(false).notNull(),
    lockedAt: timestamp("lockedAt"),
    lockedBy: int("lockedBy"),
    reopenedAt: timestamp("reopenedAt"),
    reopenedBy: int("reopenedBy"),
    reopenReason: text("reopenReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    periodIdx: index("period_date_idx").on(table.periodDate),
    typeIdx: index("period_type_idx").on(table.periodType),
  })
);

export type OperatingPeriod = typeof operatingPeriods.$inferSelect;
export type InsertOperatingPeriod = typeof operatingPeriods.$inferInsert;

// ============================================================================
// 4-ب. نموذج بيانات الجداول المعتمد (S1) — يحل تدريجيًا محل schedules/shifts
// المرجع: doc/schedule/SCHEDULE_SYSTEM.md — التوقيت: Asia/Riyadh، الأسبوع أحد-سبت
// ============================================================================

/**
 * فترة الجدول: أسبوعية أو من تاريخ إلى تاريخ بأي عدد أيام.
 * انتقالات الحالة المسموحة:
 * draft -> published -> locked -> archived
 * draft -> cancelled ، published -> cancelled (بسبب)
 * locked -> published (إعادة فتح بسبب، تُسجل في auditLogs)
 */
export const schedulePeriods = mysqlTable(
  "schedule_periods",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    startDate: date("startDate").notNull(),
    endDate: date("endDate").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "published",
      "locked",
      "cancelled",
      "archived",
    ])
      .default("draft")
      .notNull(),
    createdBy: int("createdBy")
      .notNull()
      .references(() => users.id),
    publishedBy: int("publishedBy").references(() => users.id),
    publishedAt: timestamp("publishedAt"),
    lockedBy: int("lockedBy").references(() => users.id),
    lockedAt: timestamp("lockedAt"),
    cancelledBy: int("cancelledBy").references(() => users.id),
    cancelledAt: timestamp("cancelledAt"),
    cancelReason: text("cancelReason"),
    reopenedBy: int("reopenedBy").references(() => users.id),
    reopenedAt: timestamp("reopenedAt"),
    reopenReason: text("reopenReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    startIdx: index("sched_period_start_idx").on(table.startDate),
    statusIdx: index("sched_period_status_idx").on(table.status),
    uniqueRange: uniqueIndex("sched_period_range_uq").on(
      table.startDate,
      table.endDate,
      table.name
    ),
  })
);

export type SchedulePeriod = typeof schedulePeriods.$inferSelect;
export type InsertSchedulePeriod = typeof schedulePeriods.$inferInsert;

/**
 * تعريف الوردية (قالب قابل لإعادة الاستخدام) — منفصل عن التكليف.
 * الوردية العابرة لمنتصف الليل: crossesMidnight=true وتُنسب ليوم بدايتها.
 */
export const shiftTemplates = mysqlTable(
  "shift_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 200 }).notNull(),
    nameEn: varchar("nameEn", { length: 200 }).notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    crossesMidnight: boolean("crossesMidnight").default(false).notNull(),
    durationMinutes: int("durationMinutes").notNull(),
    breakMinutes: int("breakMinutes").default(0).notNull(),
    departmentId: int("departmentId").references(() => departments.id),
    isActive: boolean("isActive").default(true).notNull(),
    effectiveFrom: date("effectiveFrom"),
    effectiveTo: date("effectiveTo"),
    createdBy: int("createdBy")
      .notNull()
      .references(() => users.id),
    updatedBy: int("updatedBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    activeIdx: index("shift_tpl_active_idx").on(table.isActive),
    deptIdx: index("shift_tpl_dept_idx").on(table.departmentId),
  })
);

export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = typeof shiftTemplates.$inferInsert;

/**
 * التكليف/الحجز: إسناد عامل إلى وردية في تاريخ عمل ضمن فترة، مع مشرف مسؤول.
 * انتقالات الحالة: planned -> confirmed -> completed
 * planned/confirmed -> cancelled (بسبب) ، planned/confirmed -> transferred (نقل، يشير transferredToId للتكليف الجديد)
 * قيد التفرد يمنع تكليف العامل مرتين بنفس البداية في نفس اليوم؛ فحص التعارض الزمني الكامل في طبقة الخدمة.
 */
export const shiftAssignments = mysqlTable(
  "shift_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    periodId: int("periodId")
      .notNull()
      .references(() => schedulePeriods.id),
    workerId: int("workerId")
      .notNull()
      .references(() => workers.id),
    shiftTemplateId: int("shiftTemplateId")
      .notNull()
      .references(() => shiftTemplates.id),
    supervisorId: int("supervisorId")
      .notNull()
      .references(() => users.id),
    costCenterId: int("costCenterId").references(() => branches.id),
    locationId: int("locationId").references(() => locations.id),
    departmentId: int("departmentId").references(() => departments.id),
    jobTitleId: int("jobTitleId").references(() => jobTitles.id),
    workDate: date("workDate").notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    crossesMidnight: boolean("crossesMidnight").default(false).notNull(),
    plannedMinutes: int("plannedMinutes").notNull(),
    breakMinutes: int("breakMinutes").default(0).notNull(),
    status: mysqlEnum("status", [
      "planned",
      "confirmed",
      "completed",
      "cancelled",
      "transferred",
    ])
      .default("planned")
      .notNull(),
    cancelReason: text("cancelReason"),
    transferredToId: int("transferredToId"),
    createdBy: int("createdBy")
      .notNull()
      .references(() => users.id),
    updatedBy: int("updatedBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    periodIdx: index("assign_period_idx").on(table.periodId),
    workerDateIdx: index("assign_worker_date_idx").on(
      table.workerId,
      table.workDate
    ),
    supervisorIdx: index("assign_supervisor_idx").on(table.supervisorId),
    statusIdx: index("assign_status_idx").on(table.status),
    uniqueSlot: uniqueIndex("assign_worker_slot_uq").on(
      table.workerId,
      table.workDate,
      table.startTime
    ),
  })
);

export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type InsertShiftAssignment = typeof shiftAssignments.$inferInsert;

/**
 * رصيد الوقت للعامل ضمن فترة: مطلوب/مجدول/منفذ/متبقٍ بالدقائق.
 * يُعاد حسابه من التكليفات والحضور؛ صف واحد لكل (عامل، فترة).
 */
export const timeBalances = mysqlTable(
  "time_balances",
  {
    id: int("id").autoincrement().primaryKey(),
    workerId: int("workerId")
      .notNull()
      .references(() => workers.id),
    periodId: int("periodId")
      .notNull()
      .references(() => schedulePeriods.id),
    requiredMinutes: int("requiredMinutes").default(0).notNull(),
    scheduledMinutes: int("scheduledMinutes").default(0).notNull(),
    executedMinutes: int("executedMinutes").default(0).notNull(),
    remainingMinutes: int("remainingMinutes").default(0).notNull(),
    lastRecalculatedAt: timestamp("lastRecalculatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workerIdx: index("balance_worker_idx").on(table.workerId),
    uniqueWorkerPeriod: uniqueIndex("balance_worker_period_uq").on(
      table.workerId,
      table.periodId
    ),
  })
);

export type TimeBalance = typeof timeBalances.$inferSelect;
export type InsertTimeBalance = typeof timeBalances.$inferInsert;

/**
 * استثناءات الجدول: طلب تمديد أو استثناء من قاعدة (حد يومي، إجازة...) على تكليف.
 * الحالات: pending -> approved | rejected ، pending -> cancelled من مقدم الطلب.
 */
export const scheduleExceptions = mysqlTable(
  "schedule_exceptions",
  {
    id: int("id").autoincrement().primaryKey(),
    assignmentId: int("assignmentId")
      .notNull()
      .references(() => shiftAssignments.id),
    exceptionType: mysqlEnum("exceptionType", [
      "extension",
      "max_daily_override",
      "leave_override",
      "rest_day_override",
      "other",
    ]).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ])
      .default("pending")
      .notNull(),
    reason: text("reason").notNull(),
    requestedBy: int("requestedBy")
      .notNull()
      .references(() => users.id),
    decidedBy: int("decidedBy").references(() => users.id),
    decidedAt: timestamp("decidedAt"),
    decisionNote: text("decisionNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    assignmentIdx: index("exception_assignment_idx").on(table.assignmentId),
    statusIdx: index("exception_status_idx").on(table.status),
  })
);

export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type InsertScheduleException = typeof scheduleExceptions.$inferInsert;

// ============================================
// Local Authentication & RBAC System
// ============================================

/**
 * Sessions table for server-side session management
 */
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 512 }).notNull().unique(),
  expiresAt: int("expires_at").notNull(), // Unix timestamp
  createdAt: int("created_at").notNull(),
  revokedAt: int("revoked_at"), // NULL = active, set to revoke
});

/**
 * Roles table
 */
export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  nameAr: varchar("name_ar", { length: 255 }).notNull().unique(),
  nameEn: varchar("name_en", { length: 255 }).notNull().unique(),
  description: text("description"),
  isSystem: int("is_system").default(0), // 1 = system role, cannot delete
  createdAt: int("created_at").notNull(),
  updatedAt: int("updated_at").notNull(),
});

/**
 * Permissions table
 */
export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(), // e.g., "workers.read", "payroll.approve"
  nameAr: varchar("name_ar", { length: 255 }).notNull(),
  nameEn: varchar("name_en", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // e.g., "workers", "payroll", "users"
  createdAt: int("created_at").notNull(),
});

/**
 * Role-Permission mapping
 */
export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: int("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: int("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
  ]
);

/**
 * User-Role mapping
 */
export const userRoles = mysqlTable(
  "user_roles",
  {
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: int("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: int("assigned_at").notNull(),
    assignedBy: int("assigned_by").references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
  ]
);

/**
 * Login attempts for rate limiting
 */
export const loginAttempts = mysqlTable("login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  success: int("success").notNull(), // 1 = success, 0 = failed
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  attemptedAt: int("attempted_at").notNull(),
});

/** Optional account restriction. No row means unrestricted; [] means no centers. */
export const userAccessScopes = mysqlTable("user_access_scopes", {
  userId: int("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  costCenterIds: json("cost_center_ids").$type<number[]>().notNull(),
});

// Update users table to add local auth fields
// ALTER TABLE users ADD COLUMN password_hash TEXT;
// ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
// ALTER TABLE users ADD COLUMN last_login_at INTEGER;
