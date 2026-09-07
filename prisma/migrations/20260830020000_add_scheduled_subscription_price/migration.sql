ALTER TABLE `Subscription`
  ADD COLUMN `scheduledPrice` INT NULL,
  ADD COLUMN `scheduledPriceAt` DATETIME(3) NULL;
