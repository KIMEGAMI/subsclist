ALTER TABLE `StripeWebhookEvent`
  ADD COLUMN `processingStartedAt` DATETIME(3) NULL;

UPDATE `StripeWebhookEvent`
SET `processingStartedAt` = `createdAt`
WHERE `processingStartedAt` IS NULL;

ALTER TABLE `StripeWebhookEvent`
  MODIFY COLUMN `processingStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
