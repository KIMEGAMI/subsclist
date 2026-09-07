ALTER TABLE `monthlyclose`
  ADD COLUMN `readinessScore` INTEGER NULL,
  ADD COLUMN `unresolvedCount` INTEGER NULL,
  ADD COLUMN `reconciliationPercent` INTEGER NULL,
  ADD COLUMN `organizationPercent` INTEGER NULL,
  ADD COLUMN `renewalDecisionPercent` INTEGER NULL;
