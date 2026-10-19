ALTER TABLE `shift_assignments` ADD COLUMN `costCenterId` int NULL;
--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD COLUMN `locationId` int NULL;
--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD COLUMN `jobTitleId` int NULL;
--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_costCenterId_branches_id_fk` FOREIGN KEY (`costCenterId`) REFERENCES `branches` (`id`);
--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations` (`id`);
--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_jobTitleId_job_titles_id_fk` FOREIGN KEY (`jobTitleId`) REFERENCES `job_titles` (`id`);
