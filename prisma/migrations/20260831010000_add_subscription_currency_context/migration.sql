ALTER TABLE `Subscription`
  ADD COLUMN `sourceAmountMinor` INTEGER NULL,
  ADD COLUMN `exchangeRateToJpyScaled` INTEGER NULL,
  ADD COLUMN `exchangeRateUpdatedAt` DATETIME(3) NULL;
