ALTER TABLE `SavingsEvent` ADD COLUMN `dedupeKey` VARCHAR(191) NULL;
UPDATE `SavingsEvent`
SET `dedupeKey` = CONCAT('legacy:', SHA2(`id`, 256))
WHERE `dedupeKey` IS NULL;
ALTER TABLE `SavingsEvent` MODIFY `dedupeKey` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `SavingsEvent_dedupeKey_key` ON `SavingsEvent`(`dedupeKey`);
