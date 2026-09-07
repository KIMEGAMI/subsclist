ALTER TABLE `PaymentHistory`
  ADD COLUMN `subscriptionNameSnapshot` VARCHAR(100) NULL,
  ADD COLUMN `categoryNameSnapshot` VARCHAR(50) NULL,
  ADD COLUMN `paymentMethodNameSnapshot` VARCHAR(50) NULL,
  ADD COLUMN `accountingLabel` VARCHAR(100) NULL,
  ADD COLUMN `referenceNumber` VARCHAR(100) NULL,
  ADD COLUMN `referenceUrl` TEXT NULL;

UPDATE `PaymentHistory` AS `history`
INNER JOIN `Subscription` AS `subscription`
  ON `subscription`.`id` = `history`.`subscriptionId`
LEFT JOIN `Category` AS `category`
  ON `category`.`id` = `subscription`.`categoryId`
LEFT JOIN `PaymentMethod` AS `paymentMethod`
  ON `paymentMethod`.`id` = `subscription`.`paymentMethodId`
SET
  `history`.`subscriptionNameSnapshot` = `subscription`.`name`,
  `history`.`categoryNameSnapshot` = `category`.`name`,
  `history`.`paymentMethodNameSnapshot` = `paymentMethod`.`name`;

ALTER TABLE `PaymentHistory`
  MODIFY `subscriptionNameSnapshot` VARCHAR(100) NOT NULL;
