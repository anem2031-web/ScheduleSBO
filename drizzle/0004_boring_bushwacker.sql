CREATE TABLE `schedule_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`exceptionType` enum('extension','max_daily_override','leave_override','rest_day_override','other') NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`reason` text NOT NULL,
	`requestedBy` int NOT NULL,
	`decidedBy` int,
	`decidedAt` timestamp,
	`decisionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`status` enum('draft','published','locked','cancelled','archived') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`publishedBy` int,
	`publishedAt` timestamp,
	`lockedBy` int,
	`lockedAt` timestamp,
	`cancelledBy` int,
	`cancelledAt` timestamp,
	`cancelReason` text,
	`reopenedBy` int,
	`reopenedAt` timestamp,
	`reopenReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_periods_id` PRIMARY KEY(`id`),
	CONSTRAINT `sched_period_range_uq` UNIQUE(`startDate`,`endDate`,`name`)
);
--> statement-breakpoint
CREATE TABLE `shift_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodId` int NOT NULL,
	`workerId` int NOT NULL,
	`shiftTemplateId` int NOT NULL,
	`supervisorId` int NOT NULL,
	`departmentId` int,
	`workDate` date NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`crossesMidnight` boolean NOT NULL DEFAULT false,
	`plannedMinutes` int NOT NULL,
	`status` enum('planned','confirmed','completed','cancelled','transferred') NOT NULL DEFAULT 'planned',
	`cancelReason` text,
	`transferredToId` int,
	`createdBy` int NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assign_worker_slot_uq` UNIQUE(`workerId`,`workDate`,`startTime`)
);
--> statement-breakpoint
CREATE TABLE `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(200) NOT NULL,
	`nameEn` varchar(200) NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`crossesMidnight` boolean NOT NULL DEFAULT false,
	`durationMinutes` int NOT NULL,
	`departmentId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`effectiveFrom` date,
	`effectiveTo` date,
	`createdBy` int NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `shift_templates_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `time_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`periodId` int NOT NULL,
	`requiredMinutes` int NOT NULL DEFAULT 0,
	`scheduledMinutes` int NOT NULL DEFAULT 0,
	`executedMinutes` int NOT NULL DEFAULT 0,
	`remainingMinutes` int NOT NULL DEFAULT 0,
	`lastRecalculatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `balance_worker_period_uq` UNIQUE(`workerId`,`periodId`)
);
--> statement-breakpoint
ALTER TABLE `schedule_exceptions` ADD CONSTRAINT `schedule_exceptions_assignmentId_shift_assignments_id_fk` FOREIGN KEY (`assignmentId`) REFERENCES `shift_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_exceptions` ADD CONSTRAINT `schedule_exceptions_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_exceptions` ADD CONSTRAINT `schedule_exceptions_decidedBy_users_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_publishedBy_users_id_fk` FOREIGN KEY (`publishedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_lockedBy_users_id_fk` FOREIGN KEY (`lockedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_cancelledBy_users_id_fk` FOREIGN KEY (`cancelledBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_reopenedBy_users_id_fk` FOREIGN KEY (`reopenedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_periodId_schedule_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `schedule_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_workerId_workers_id_fk` FOREIGN KEY (`workerId`) REFERENCES `workers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_shiftTemplateId_shift_templates_id_fk` FOREIGN KEY (`shiftTemplateId`) REFERENCES `shift_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_supervisorId_users_id_fk` FOREIGN KEY (`supervisorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `time_balances` ADD CONSTRAINT `time_balances_workerId_workers_id_fk` FOREIGN KEY (`workerId`) REFERENCES `workers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `time_balances` ADD CONSTRAINT `time_balances_periodId_schedule_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `schedule_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exception_assignment_idx` ON `schedule_exceptions` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `exception_status_idx` ON `schedule_exceptions` (`status`);--> statement-breakpoint
CREATE INDEX `sched_period_start_idx` ON `schedule_periods` (`startDate`);--> statement-breakpoint
CREATE INDEX `sched_period_status_idx` ON `schedule_periods` (`status`);--> statement-breakpoint
CREATE INDEX `assign_period_idx` ON `shift_assignments` (`periodId`);--> statement-breakpoint
CREATE INDEX `assign_worker_date_idx` ON `shift_assignments` (`workerId`,`workDate`);--> statement-breakpoint
CREATE INDEX `assign_supervisor_idx` ON `shift_assignments` (`supervisorId`);--> statement-breakpoint
CREATE INDEX `assign_status_idx` ON `shift_assignments` (`status`);--> statement-breakpoint
CREATE INDEX `shift_tpl_active_idx` ON `shift_templates` (`isActive`);--> statement-breakpoint
CREATE INDEX `shift_tpl_dept_idx` ON `shift_templates` (`departmentId`);--> statement-breakpoint
CREATE INDEX `balance_worker_idx` ON `time_balances` (`workerId`);