-- Apply explicitly before enabling WhatsApp pilot delivery; contains no existing data changes.
CREATE TABLE IF NOT EXISTS `whatsapp_trial_schedule_state` (
  `period_id` int NOT NULL,
  `worker_id` int NOT NULL,
  `snapshot` json NULL,
  `pending_snapshot` json NULL,
  `state` enum('idle','sending','needs_review') NOT NULL DEFAULT 'idle',
  `claim_id` varchar(36) NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`period_id`, `worker_id`),
  CONSTRAINT `wa_trial_state_period_fk` FOREIGN KEY (`period_id`) REFERENCES `schedule_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wa_trial_state_worker_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers` (`id`) ON DELETE CASCADE
);
