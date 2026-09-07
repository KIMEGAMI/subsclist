CREATE TABLE `MonthlyClose` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `paidAmount` INTEGER NOT NULL,
  `businessPaidAmount` INTEGER NOT NULL,
  `activeMonthlyAmount` INTEGER NOT NULL,
  `activeSubscriptionCount` INTEGER NOT NULL,
  `reviewedSubscriptionCount` INTEGER NOT NULL,
  `deadlineRiskCount` INTEGER NOT NULL,
  `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MonthlyClose_userId_year_month_key`(`userId`, `year`, `month`),
  INDEX `MonthlyClose_userId_completedAt_idx`(`userId`, `completedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MonthlyClose` ADD CONSTRAINT `MonthlyClose_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
