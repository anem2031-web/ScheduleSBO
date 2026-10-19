ALTER TABLE `sessions` MODIFY COLUMN `token` varchar(512) NOT NULL;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `branch` varchar(50);--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `weeklyRestDay` int;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `patternType` enum('single','split') DEFAULT 'single';--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `p1Start` time;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `p1End` time;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `p2Start` time;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `p2End` time;--> statement-breakpoint
ALTER TABLE `worker_schedule_settings` ADD `dayOverrides` json;