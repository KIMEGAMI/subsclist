ALTER TABLE `PaymentHistory`
  ADD COLUMN `businessUsePercent` INTEGER NOT NULL DEFAULT 0;

UPDATE `PaymentHistory` AS history
INNER JOIN `Subscription` AS subscription ON subscription.`id` = history.`subscriptionId`
SET history.`businessUsePercent` = subscription.`businessUsePercent`;
