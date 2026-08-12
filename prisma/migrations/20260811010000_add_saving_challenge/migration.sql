CREATE TABLE `SavingChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `potentialMonthlySaving` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SavingChallenge_userId_year_month_key`(`userId`, `year`, `month`),
  INDEX `SavingChallenge_subscriptionId_idx`(`subscriptionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
