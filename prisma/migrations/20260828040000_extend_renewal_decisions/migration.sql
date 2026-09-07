ALTER TABLE `SavingChallenge`
  ADD COLUMN `reason` VARCHAR(500) NULL,
  ADD COLUMN `renewalDate` DATE NULL,
  ADD COLUMN `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `SavingChallenge` AS `decision`
LEFT JOIN `Subscription` AS `subscription`
  ON `subscription`.`id` = `decision`.`subscriptionId`
SET `decision`.`renewalDate` = COALESCE(
  DATE(`subscription`.`nextBillingDate`),
  DATE(`decision`.`createdAt`)
);

ALTER TABLE `SavingChallenge`
  MODIFY `renewalDate` DATE NOT NULL;

DROP INDEX `SavingChallenge_userId_year_month_key` ON `SavingChallenge`;

CREATE UNIQUE INDEX `SavingChallenge_userId_subscriptionId_year_month_key`
  ON `SavingChallenge`(`userId`, `subscriptionId`, `year`, `month`);
CREATE INDEX `SavingChallenge_userId_decidedAt_idx`
  ON `SavingChallenge`(`userId`, `decidedAt`);

DROP INDEX `SavingChallenge_userId_idx` ON `SavingChallenge`;
