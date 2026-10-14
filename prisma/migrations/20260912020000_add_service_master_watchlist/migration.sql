CREATE TABLE `ServiceMaster` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `officialUrl` TEXT NOT NULL,
  `pricingUrl` TEXT NULL,
  `newsUrl` TEXT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ServiceMaster_slug_key`(`slug`),
  INDEX `ServiceMaster_status_name_idx`(`status`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ServiceWatchlist` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `serviceId` VARCHAR(191) NOT NULL,
  `watchPrice` BOOLEAN NOT NULL DEFAULT true,
  `watchNews` BOOLEAN NOT NULL DEFAULT true,
  `watchNewPlan` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ServiceWatchlist_userId_serviceId_key`(`userId`, `serviceId`),
  INDEX `ServiceWatchlist_serviceId_idx`(`serviceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Subscription` ADD COLUMN `serviceMasterId` VARCHAR(191) NULL;
CREATE INDEX `Subscription_serviceMasterId_idx` ON `Subscription`(`serviceMasterId`);
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_serviceMasterId_fkey` FOREIGN KEY (`serviceMasterId`) REFERENCES `ServiceMaster`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ServiceWatchlist` ADD CONSTRAINT `ServiceWatchlist_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceWatchlist` ADD CONSTRAINT `ServiceWatchlist_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
