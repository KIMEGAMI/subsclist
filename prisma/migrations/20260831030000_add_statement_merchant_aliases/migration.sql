CREATE TABLE `StatementMerchantAlias` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `merchantLabel` VARCHAR(200) NOT NULL,
    `normalizedMerchant` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StatementMerchantAlias_userId_normalizedMerchant_key`(`userId`, `normalizedMerchant`),
    INDEX `StatementMerchantAlias_subscriptionId_createdAt_idx`(`subscriptionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StatementMerchantAlias`
    ADD CONSTRAINT `StatementMerchantAlias_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StatementMerchantAlias`
    ADD CONSTRAINT `StatementMerchantAlias_subscriptionId_fkey`
    FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
