CREATE TABLE `NewsGenerationRun` (
  `id` VARCHAR(191) NOT NULL,
  `dayKey` DATE NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `officialImported` INTEGER NOT NULL DEFAULT 0,
  `generatedArticles` INTEGER NOT NULL DEFAULT 0,
  `failedArticleCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NewsGenerationRun_dayKey_key`(`dayKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
