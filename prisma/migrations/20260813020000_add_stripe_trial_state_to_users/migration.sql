ALTER TABLE `User`
  ADD COLUMN `stripeSubscriptionStatus` VARCHAR(191) NULL,
  ADD COLUMN `stripeTrialStartAt` DATETIME(3) NULL,
  ADD COLUMN `stripeTrialEndAt` DATETIME(3) NULL;
