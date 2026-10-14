CREATE TABLE `NewsItem` (
  `id` VARCHAR(191) NOT NULL, `serviceId` VARCHAR(191) NULL, `title` VARCHAR(300) NOT NULL, `summaryBase` TEXT NULL,
  `sourceUrl` TEXT NOT NULL, `sourceName` VARCHAR(100) NOT NULL, `sourceType` VARCHAR(50) NOT NULL,
  `publishedAt` DATETIME(3) NULL, `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `category` VARCHAR(50) NOT NULL,
  `importance` INTEGER NOT NULL DEFAULT 0, `trustLevel` ENUM('OFFICIAL','VERIFIED','INFERRED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN', `contentHash` CHAR(64) NOT NULL,
  UNIQUE INDEX `NewsItem_contentHash_key`(`contentHash`), INDEX `NewsItem_serviceId_publishedAt_idx`(`serviceId`,`publishedAt`), INDEX `NewsItem_publishedAt_importance_idx`(`publishedAt`,`importance`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `UserNewsFeedback` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `newsItemId` VARCHAR(191) NOT NULL, `feedback` VARCHAR(20) NOT NULL, `clickedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UserNewsFeedback_userId_newsItemId_key`(`userId`,`newsItemId`), INDEX `UserNewsFeedback_newsItemId_idx`(`newsItemId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `NewsItem` ADD CONSTRAINT `NewsItem_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceMaster`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `UserNewsFeedback` ADD CONSTRAINT `UserNewsFeedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserNewsFeedback` ADD CONSTRAINT `UserNewsFeedback_newsItemId_fkey` FOREIGN KEY (`newsItemId`) REFERENCES `NewsItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
