-- Unknown dates must remain unknown rather than becoming a fabricated hire date.
ALTER TABLE `workers` MODIFY COLUMN `hireDate` date NULL;

-- Stored separately so existing supervisor/read endpoints never expose identity documents.
CREATE TABLE IF NOT EXISTS `worker_private_identifiers` (
  `workerId` int NOT NULL PRIMARY KEY,
  `nationalId` varchar(20) NOT NULL UNIQUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `worker_private_identifiers_worker_fk` FOREIGN KEY (`workerId`) REFERENCES `workers` (`id`)
);
