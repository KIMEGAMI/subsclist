CREATE TABLE `ServicePriceSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `planName` VARCHAR(100) NOT NULL,
    `billingCycle` VARCHAR(30) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `amount` INT NOT NULL,
    `taxIncluded` BOOLEAN NULL,
    `sourceUrl` TEXT NOT NULL,
    `trustLevel` ENUM('OFFICIAL', 'VERIFIED', 'INFERRED', 'UNKNOWN') NOT NULL DEFAULT 'OFFICIAL',
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServicePriceSnapshot_serviceId_planName_fetchedAt_idx`(`serviceId`, `planName`, `fetchedAt`),
    CONSTRAINT `ServicePriceSnapshot_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ServicePriceChange` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `planName` VARCHAR(100) NOT NULL,
    `oldAmount` INT NOT NULL,
    `newAmount` INT NOT NULL,
    `changeAmount` INT NOT NULL,
    `changePercent` DOUBLE NULL,
    `currency` CHAR(3) NOT NULL,
    `sourceUrl` TEXT NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT true,
    `effectiveAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServicePriceChange_serviceId_createdAt_idx`(`serviceId`, `createdAt`),
    CONSTRAINT `ServicePriceChange_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
