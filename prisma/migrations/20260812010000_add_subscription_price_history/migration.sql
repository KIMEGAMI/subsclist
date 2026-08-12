CREATE TABLE `SubscriptionPriceHistory` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `price` INTEGER NOT NULL,
  `billingCycle` ENUM('MONTHLY', 'YEARLY', 'WEEKLY', 'CUSTOM') NOT NULL,
  `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SubscriptionPriceHistory_userId_effectiveFrom_idx`(`userId`, `effectiveFrom`),
  INDEX `SubscriptionPriceHistory_subscriptionId_effectiveFrom_idx`(`subscriptionId`, `effectiveFrom`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SubscriptionPriceHistory`
  ADD CONSTRAINT `SubscriptionPriceHistory_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SubscriptionPriceHistory_subscriptionId_fkey`
  FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
