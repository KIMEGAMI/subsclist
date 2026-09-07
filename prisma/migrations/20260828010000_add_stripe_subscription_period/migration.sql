ALTER TABLE `User`
  ADD COLUMN `stripeCurrentPeriodEnd` DATETIME(3) NULL,
  ADD COLUMN `stripeCancelAt` DATETIME(3) NULL,
  ADD COLUMN `stripeCancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false;
