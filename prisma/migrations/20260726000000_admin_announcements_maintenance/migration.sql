CREATE TABLE `Announcement` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `published` BOOLEAN NOT NULL DEFAULT true,
  `pinned` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AppSetting` (
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Announcement_published_pinned_createdAt_idx` ON `Announcement`(`published`, `pinned`, `createdAt`);
