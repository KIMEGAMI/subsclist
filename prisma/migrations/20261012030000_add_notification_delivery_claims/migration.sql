ALTER TABLE `NotificationDelivery`
  MODIFY COLUMN `sentAt` DATETIME(3) NULL,
  ADD COLUMN `claimedAt` DATETIME(3) NULL,
  ADD COLUMN `claimToken` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `NotificationDelivery_claimToken_key` (`claimToken`);

ALTER TABLE `UserNotificationDelivery`
  MODIFY COLUMN `sentAt` DATETIME(3) NULL,
  ADD COLUMN `claimedAt` DATETIME(3) NULL,
  ADD COLUMN `claimToken` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `UserNotificationDelivery_claimToken_key` (`claimToken`);
