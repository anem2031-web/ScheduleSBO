-- Additive migration: existing workers keep NULL until a phone is entered.
ALTER TABLE `workers` ADD COLUMN `phoneNumber` varchar(32) NULL;
