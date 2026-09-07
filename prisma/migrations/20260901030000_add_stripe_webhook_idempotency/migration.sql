CREATE TABLE `StripeWebhookEvent` (
  `id` VARCHAR(255) NOT NULL,
  `type` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,

  INDEX `StripeWebhookEvent_processedAt_idx`(`processedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
