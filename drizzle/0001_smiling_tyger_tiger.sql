CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`attendanceDate` date NOT NULL,
	`checkInTime` timestamp,
	`checkOutTime` timestamp,
	`actualHours` decimal(5,2),
	`status` enum('present','absent','late','early_leave','overtime','excused') NOT NULL DEFAULT 'present',
	`notes` text,
	`recordedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceId` int NOT NULL,
	`originalCheckIn` timestamp,
	`originalCheckOut` timestamp,
	`correctedCheckIn` timestamp,
	`correctedCheckOut` timestamp,
	`reason` text NOT NULL,
	`correctedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(100) NOT NULL,
	`entityId` int NOT NULL,
	`action` enum('create','update','delete','approve','reject') NOT NULL,
	`oldValues` json,
	`newValues` json,
	`reason` text,
	`referenceDocument` varchar(500),
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `day_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameUr` varchar(255),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `day_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `day_types_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameUr` varchar(255),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `evaluation_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameUr` varchar(255),
	`departmentId` int,
	`evaluationType` enum('daily','weekly','monthly') NOT NULL,
	`criteria` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evaluation_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `evaluation_templates_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`templateId` int NOT NULL,
	`evaluationDate` date NOT NULL,
	`evaluationType` enum('daily','weekly','monthly') NOT NULL,
	`scores` json NOT NULL,
	`totalScore` decimal(5,2) NOT NULL,
	`notes` text,
	`evaluatedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`status` enum('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incentive_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameUr` varchar(255),
	`departmentId` int,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incentive_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `incentive_categories_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `incentive_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`ruleCode` varchar(100) NOT NULL,
	`ruleDefinition` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incentive_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incentives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`categoryId` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`baseAmount` decimal(12,2) NOT NULL,
	`bonusAmount` decimal(12,2) DEFAULT '0',
	`deductionAmount` decimal(12,2) DEFAULT '0',
	`totalAmount` decimal(12,2) NOT NULL,
	`calculationDetails` json,
	`calculatedBy` int NOT NULL,
	`calculatedAt` timestamp NOT NULL,
	`status` enum('calculated','approved','rejected','paid') NOT NULL DEFAULT 'calculated',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incentives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_titles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`titleAr` varchar(255) NOT NULL,
	`titleEn` varchar(255),
	`titleUr` varchar(255),
	`departmentId` int,
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_titles_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_titles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` enum('info','warning','error','success') NOT NULL DEFAULT 'info',
	`actionUrl` varchar(500),
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operating_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodType` enum('daily','weekly','monthly') NOT NULL,
	`periodDate` date NOT NULL,
	`isLocked` boolean NOT NULL DEFAULT false,
	`lockedAt` timestamp,
	`lockedBy` int,
	`reopenedAt` timestamp,
	`reopenedBy` int,
	`reopenReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operating_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `overtime_reasons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`reasonAr` varchar(255) NOT NULL,
	`reasonEn` varchar(255),
	`reasonUr` varchar(255),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `overtime_reasons_id` PRIMARY KEY(`id`),
	CONSTRAINT `overtime_reasons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `overtimes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`overtimeDate` date NOT NULL,
	`hours` decimal(5,2) NOT NULL,
	`reasonId` int NOT NULL,
	`hourlyRate` decimal(10,2) NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`status` enum('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `overtimes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_details` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollSheetId` int NOT NULL,
	`workerId` int NOT NULL,
	`baseSalary` decimal(12,2) NOT NULL,
	`incentives` decimal(12,2) DEFAULT '0',
	`overtimeAmount` decimal(12,2) DEFAULT '0',
	`deductions` decimal(12,2) DEFAULT '0',
	`totalAmount` decimal(12,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_details_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_sheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollCode` varchar(100) NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`departmentId` int,
	`totalWorkers` int NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`status` enum('draft','hr_approved','financial_reviewed','accounting_approved','paid','archived') NOT NULL DEFAULT 'draft',
	`hrApprovedBy` int,
	`hrApprovedAt` timestamp,
	`financialReviewedBy` int,
	`financialReviewedAt` timestamp,
	`accountingApprovedBy` int,
	`accountingApprovedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_sheets_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_sheets_payrollCode_unique` UNIQUE(`payrollCode`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`requestType` enum('leave','justification','correction','exception') NOT NULL,
	`requestDate` date NOT NULL,
	`reason` text NOT NULL,
	`attachments` json,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`submittedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCode` varchar(100) NOT NULL,
	`departmentId` int NOT NULL,
	`weekStartDate` date NOT NULL,
	`weekEndDate` date NOT NULL,
	`status` enum('draft','published','locked','archived') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedules_scheduleCode_unique` UNIQUE(`scheduleCode`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleId` int NOT NULL,
	`workerId` int NOT NULL,
	`shiftDate` date NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`plannedHours` decimal(5,2) NOT NULL,
	`shiftType` enum('morning','afternoon','evening','night','custom') NOT NULL DEFAULT 'custom',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supervisor_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`supervisorId` int NOT NULL,
	`assignmentType` enum('primary','secondary','temporary') NOT NULL DEFAULT 'primary',
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supervisor_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(100) NOT NULL,
	`settingValue` longtext NOT NULL,
	`description` text,
	`dataType` enum('string','number','boolean','json') NOT NULL DEFAULT 'string',
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(100) NOT NULL,
	`entityId` int NOT NULL,
	`fieldName` varchar(100) NOT NULL,
	`language` enum('ar','en','ur') NOT NULL,
	`value` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_calendar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`date` date NOT NULL,
	`dayTypeId` int NOT NULL,
	`reason` text,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worker_calendar_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_salaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`baseSalary` decimal(12,2) NOT NULL,
	`totalSalary` decimal(12,2) NOT NULL,
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `worker_salaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_schedule_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`requiredHoursPerDay` decimal(5,2) NOT NULL,
	`standardMonthlyHours` decimal(7,2) NOT NULL,
	`maxDailyHours` decimal(5,2) NOT NULL,
	`allowedShifts` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_schedule_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_schedule_settings_workerId_unique` UNIQUE(`workerId`)
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` varchar(50) NOT NULL,
	`fingerprintId` varchar(50),
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameUr` varchar(255),
	`nationality` varchar(100),
	`jobTitleId` int NOT NULL,
	`departmentId` int NOT NULL,
	`primarySupervisorId` int,
	`hireDate` date NOT NULL,
	`status` enum('active','inactive','on_leave','terminated') NOT NULL DEFAULT 'active',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workers_id` PRIMARY KEY(`id`),
	CONSTRAINT `workers_employeeId_unique` UNIQUE(`employeeId`),
	CONSTRAINT `workers_fingerprintId_unique` UNIQUE(`fingerprintId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','hr_admin','supervisor','guard','worker','financial_reviewer','finance','accounting_head','modifier') NOT NULL DEFAULT 'worker';--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `attendance_worker_date_idx` ON `attendance` (`workerId`,`attendanceDate`);--> statement-breakpoint
CREATE INDEX `attendance_status_idx` ON `attendance` (`status`);--> statement-breakpoint
CREATE INDEX `correction_attendance_idx` ON `attendance_corrections` (`attendanceId`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entityType`);--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_logs` (`performedBy`);--> statement-breakpoint
CREATE INDEX `audit_date_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `daytype_code_idx` ON `day_types` (`code`);--> statement-breakpoint
CREATE INDEX `dept_code_idx` ON `departments` (`code`);--> statement-breakpoint
CREATE INDEX `eval_template_code_idx` ON `evaluation_templates` (`code`);--> statement-breakpoint
CREATE INDEX `eval_template_dept_idx` ON `evaluation_templates` (`departmentId`);--> statement-breakpoint
CREATE INDEX `evaluation_worker_idx` ON `evaluations` (`workerId`);--> statement-breakpoint
CREATE INDEX `evaluation_template_idx` ON `evaluations` (`templateId`);--> statement-breakpoint
CREATE INDEX `evaluation_date_idx` ON `evaluations` (`evaluationDate`);--> statement-breakpoint
CREATE INDEX `incentive_cat_code_idx` ON `incentive_categories` (`code`);--> statement-breakpoint
CREATE INDEX `incentive_cat_dept_idx` ON `incentive_categories` (`departmentId`);--> statement-breakpoint
CREATE INDEX `rule_category_idx` ON `incentive_rules` (`categoryId`);--> statement-breakpoint
CREATE INDEX `rule_code_idx` ON `incentive_rules` (`ruleCode`);--> statement-breakpoint
CREATE INDEX `incentive_worker_idx` ON `incentives` (`workerId`);--> statement-breakpoint
CREATE INDEX `incentive_category_idx` ON `incentives` (`categoryId`);--> statement-breakpoint
CREATE INDEX `incentive_period_idx` ON `incentives` (`periodStart`);--> statement-breakpoint
CREATE INDEX `job_code_idx` ON `job_titles` (`code`);--> statement-breakpoint
CREATE INDEX `job_dept_idx` ON `job_titles` (`departmentId`);--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notification_read_idx` ON `notifications` (`isRead`);--> statement-breakpoint
CREATE INDEX `period_date_idx` ON `operating_periods` (`periodDate`);--> statement-breakpoint
CREATE INDEX `period_type_idx` ON `operating_periods` (`periodType`);--> statement-breakpoint
CREATE INDEX `overtime_reason_code_idx` ON `overtime_reasons` (`code`);--> statement-breakpoint
CREATE INDEX `overtime_worker_idx` ON `overtimes` (`workerId`);--> statement-breakpoint
CREATE INDEX `overtime_date_idx` ON `overtimes` (`overtimeDate`);--> statement-breakpoint
CREATE INDEX `payroll_detail_payroll_idx` ON `payroll_details` (`payrollSheetId`);--> statement-breakpoint
CREATE INDEX `payroll_detail_worker_idx` ON `payroll_details` (`workerId`);--> statement-breakpoint
CREATE INDEX `payroll_code_idx` ON `payroll_sheets` (`payrollCode`);--> statement-breakpoint
CREATE INDEX `payroll_period_idx` ON `payroll_sheets` (`periodStart`);--> statement-breakpoint
CREATE INDEX `request_worker_idx` ON `requests` (`workerId`);--> statement-breakpoint
CREATE INDEX `request_type_idx` ON `requests` (`requestType`);--> statement-breakpoint
CREATE INDEX `schedule_code_idx` ON `schedules` (`scheduleCode`);--> statement-breakpoint
CREATE INDEX `schedule_dept_idx` ON `schedules` (`departmentId`);--> statement-breakpoint
CREATE INDEX `schedule_week_idx` ON `schedules` (`weekStartDate`);--> statement-breakpoint
CREATE INDEX `shift_schedule_idx` ON `shifts` (`scheduleId`);--> statement-breakpoint
CREATE INDEX `shift_worker_idx` ON `shifts` (`workerId`);--> statement-breakpoint
CREATE INDEX `shift_date_idx` ON `shifts` (`shiftDate`);--> statement-breakpoint
CREATE INDEX `supervisor_assign_worker_idx` ON `supervisor_assignments` (`workerId`);--> statement-breakpoint
CREATE INDEX `supervisor_assign_supervisor_idx` ON `supervisor_assignments` (`supervisorId`);--> statement-breakpoint
CREATE INDEX `setting_key_idx` ON `system_settings` (`settingKey`);--> statement-breakpoint
CREATE INDEX `translation_entity_idx` ON `translations` (`entityType`);--> statement-breakpoint
CREATE INDEX `translation_language_idx` ON `translations` (`language`);--> statement-breakpoint
CREATE INDEX `calendar_worker_date_idx` ON `worker_calendar` (`workerId`,`date`);--> statement-breakpoint
CREATE INDEX `calendar_daytype_idx` ON `worker_calendar` (`dayTypeId`);--> statement-breakpoint
CREATE INDEX `salary_worker_idx` ON `worker_salaries` (`workerId`);--> statement-breakpoint
CREATE INDEX `salary_effective_idx` ON `worker_salaries` (`effectiveFrom`);--> statement-breakpoint
CREATE INDEX `schedule_settings_worker_idx` ON `worker_schedule_settings` (`workerId`);--> statement-breakpoint
CREATE INDEX `worker_employee_id_idx` ON `workers` (`employeeId`);--> statement-breakpoint
CREATE INDEX `worker_fingerprint_idx` ON `workers` (`fingerprintId`);--> statement-breakpoint
CREATE INDEX `worker_dept_idx` ON `workers` (`departmentId`);--> statement-breakpoint
CREATE INDEX `worker_supervisor_idx` ON `workers` (`primarySupervisorId`);--> statement-breakpoint
CREATE INDEX `openId_idx` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `role_idx` ON `users` (`role`);