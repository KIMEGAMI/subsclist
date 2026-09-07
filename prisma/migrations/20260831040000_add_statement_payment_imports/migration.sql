CREATE TABLE `StatementPaymentImport` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `importedCount` INTEGER NOT NULL,
    `savedAliasCount` INTEGER NOT NULL DEFAULT 0,
    `undoneAt` DATETIME(3) NULL,
    `undoneCount` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StatementPaymentImport_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaymentHistory`
    ADD COLUMN `statementPaymentImportId` VARCHAR(191) NULL,
    ADD INDEX `PaymentHistory_statementPaymentImportId_idx`(`statementPaymentImportId`);

ALTER TABLE `StatementPaymentImport`
    ADD CONSTRAINT `StatementPaymentImport_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PaymentHistory`
    ADD CONSTRAINT `PaymentHistory_statementPaymentImportId_fkey`
    FOREIGN KEY (`statementPaymentImportId`) REFERENCES `StatementPaymentImport`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
