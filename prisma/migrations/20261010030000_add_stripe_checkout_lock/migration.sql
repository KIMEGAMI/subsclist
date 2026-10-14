ALTER TABLE `User`
  ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL,
  ADD COLUMN `stripeCheckoutLockToken` VARCHAR(191) NULL,
  ADD COLUMN `stripeCheckoutLockUntil` DATETIME(3) NULL,
  ADD UNIQUE INDEX `User_stripeCheckoutSessionId_key` (`stripeCheckoutSessionId`),
  ADD UNIQUE INDEX `User_stripeCheckoutLockToken_key` (`stripeCheckoutLockToken`);
