CREATE TABLE `WeeklyUsageReview` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `weekStart` DATE NOT NULL,
  `usageRange` ENUM('ZERO', 'ONE_TWO', 'THREE_FIVE', 'SIX_SEVEN') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WeeklyUsageReview_userId_subscriptionId_weekStart_key`(`userId`, `subscriptionId`, `weekStart`),
  INDEX `WeeklyUsageReview_userId_weekStart_idx`(`userId`, `weekStart`),
  INDEX `WeeklyUsageReview_subscriptionId_weekStart_idx`(`subscriptionId`, `weekStart`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WeeklyUsageReview`
  ADD CONSTRAINT `WeeklyUsageReview_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WeeklyUsageReview_subscriptionId_fkey`
  FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
