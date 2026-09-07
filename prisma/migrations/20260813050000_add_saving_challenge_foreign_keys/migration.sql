CREATE INDEX `SavingChallenge_userId_idx` ON `SavingChallenge`(`userId`);

ALTER TABLE `SavingChallenge`
  ADD CONSTRAINT `SavingChallenge_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SavingChallenge_subscriptionId_fkey`
  FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
