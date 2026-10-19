CREATE TABLE `branch_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`locationId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branch_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_loc_unique` UNIQUE(`branchId`,`locationId`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `location_departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationId` int NOT NULL,
	`departmentId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `location_departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `loc_dept_unique` UNIQUE(`locationId`,`departmentId`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `locations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `branch_locations` ADD CONSTRAINT `branch_locations_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_locations` ADD CONSTRAINT `branch_locations_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_departments` ADD CONSTRAINT `location_departments_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_departments` ADD CONSTRAINT `location_departments_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `branch_loc_branch_idx` ON `branch_locations` (`branchId`);--> statement-breakpoint
CREATE INDEX `branch_loc_location_idx` ON `branch_locations` (`locationId`);--> statement-breakpoint
CREATE INDEX `branch_code_idx` ON `branches` (`code`);--> statement-breakpoint
CREATE INDEX `loc_dept_location_idx` ON `location_departments` (`locationId`);--> statement-breakpoint
CREATE INDEX `loc_dept_department_idx` ON `location_departments` (`departmentId`);--> statement-breakpoint
CREATE INDEX `location_code_idx` ON `locations` (`code`);