CREATE TABLE `EmailChangeToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `newEmail` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmailChangeToken_tokenHash_key`(`tokenHash`),
  INDEX `EmailChangeToken_userId_idx`(`userId`),
  INDEX `EmailChangeToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailChangeToken`
  ADD CONSTRAINT `EmailChangeToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
