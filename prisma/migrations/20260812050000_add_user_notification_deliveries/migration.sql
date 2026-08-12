CREATE TABLE `UserNotificationDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserNotificationDelivery_userId_type_scheduledFor_key`(`userId`, `type`, `scheduledFor`),
  INDEX `UserNotificationDelivery_userId_sentAt_idx`(`userId`, `sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserNotificationDelivery`
  ADD CONSTRAINT `UserNotificationDelivery_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
