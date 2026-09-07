ALTER TABLE `User`
  ADD CONSTRAINT `User_stripeCustomerId_key` UNIQUE (`stripeCustomerId`),
  ADD CONSTRAINT `User_stripeSubscriptionId_key` UNIQUE (`stripeSubscriptionId`);
