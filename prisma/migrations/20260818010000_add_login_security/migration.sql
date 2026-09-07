ALTER TABLE `User`
  ADD COLUMN `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastFailedLoginAt` DATETIME(3) NULL,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL;

CREATE TABLE `TrustedLoginDevice` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `clientLabel` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TrustedLoginDevice_userId_tokenHash_key` (`userId`, `tokenHash`),
  INDEX `TrustedLoginDevice_userId_lastUsedAt_idx` (`userId`, `lastUsedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LoginSecurityEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` ENUM('LOGIN_SUCCESS', 'NEW_DEVICE', 'ACCOUNT_LOCKED', 'ALL_SESSIONS_REVOKED') NOT NULL,
  `clientLabel` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `LoginSecurityEvent_userId_createdAt_idx` (`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TrustedLoginDevice`
  ADD CONSTRAINT `TrustedLoginDevice_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LoginSecurityEvent`
  ADD CONSTRAINT `LoginSecurityEvent_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
