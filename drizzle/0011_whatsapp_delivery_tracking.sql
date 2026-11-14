-- Apply explicitly after review; prior messages have no recoverable Meta ID and are not backfilled.
CREATE TABLE IF NOT EXISTS `whatsapp_delivery_messages` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `period_id` int NOT NULL, `worker_id` int NOT NULL,
  `kind` enum('weekly','update') NOT NULL, `work_date` date NULL,
  `phone_ending` varchar(4) NOT NULL, `message_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL UNIQUE,
  `state` enum('pending','sent','failed','unknown') NOT NULL DEFAULT 'pending',
  `error_code` varchar(40) NULL, `error_summary` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `accepted_at` timestamp NULL,
  KEY `wa_delivery_period_idx` (`period_id`), KEY `wa_delivery_worker_idx` (`worker_id`), KEY `wa_delivery_created_idx` (`created_at`)
);
CREATE TABLE IF NOT EXISTS `whatsapp_delivery_events` (
  `event_key` varchar(64) NOT NULL PRIMARY KEY, `message_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `status` enum('sent','delivered','read','failed') NOT NULL,
  `occurred_at` timestamp NOT NULL, `error_code` varchar(40) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `wa_event_message_idx` (`message_id`)
);
CREATE TABLE IF NOT EXISTS `whatsapp_delivery_destinations` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY, `delivery_id` int NOT NULL,
  `branch_id` int NULL, `location_id` int NULL, `department_id` int NULL, `supervisor_id` int NULL,
  KEY `wa_destination_delivery_idx` (`delivery_id`)
);
