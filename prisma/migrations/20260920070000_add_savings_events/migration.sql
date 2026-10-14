CREATE TABLE `SavingsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `beforeMonthlyAmount` INT NOT NULL,
    `afterMonthlyAmount` INT NOT NULL,
    `monthlySaving` INT NOT NULL,
    `annualSaving` INT NOT NULL,
    `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `SavingsEvent_userId_confirmedAt_idx`(`userId`, `confirmedAt`),
    INDEX `SavingsEvent_subscriptionId_confirmedAt_idx`(`subscriptionId`, `confirmedAt`),
    CONSTRAINT `SavingsEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `SavingsEvent_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
