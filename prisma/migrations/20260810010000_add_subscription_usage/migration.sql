CREATE TABLE `SubscriptionUsage` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `usedDate` DATE NOT NULL,
  `usageCount` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SubscriptionUsage_userId_subscriptionId_usedDate_key`(`userId`, `subscriptionId`, `usedDate`),
  INDEX `SubscriptionUsage_userId_usedDate_idx`(`userId`, `usedDate`),
  INDEX `SubscriptionUsage_subscriptionId_usedDate_idx`(`subscriptionId`, `usedDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SubscriptionUsage`
  ADD CONSTRAINT `SubscriptionUsage_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SubscriptionUsage_subscriptionId_fkey`
  FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
