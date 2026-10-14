CREATE TABLE `ServiceAlternative` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `alternativeServiceId` VARCHAR(191) NOT NULL,
    `categoryMatch` INT NULL,
    `featureSimilarity` INT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ServiceAlternative_serviceId_alternativeServiceId_key`(`serviceId`, `alternativeServiceId`),
    INDEX `ServiceAlternative_alternativeServiceId_idx`(`alternativeServiceId`),
    CONSTRAINT `ServiceAlternative_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ServiceAlternative_alternativeServiceId_fkey` FOREIGN KEY (`alternativeServiceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
