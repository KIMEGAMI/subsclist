const DROP_ALTERNATIVES = "20260630020000_remove_manual_alternatives";
const UNIQUE_STRIPE_IDS = "20260813030000_add_unique_stripe_identifiers";
const CREATE_SAVINGS_EVENTS = "20260920070000_add_savings_events";
const ADD_SAVINGS_DEDUPE = "20260920080000_add_savings_event_dedupe_key";

class MigrationPreflightBlockedError extends Error {}

function block(message) {
  throw new MigrationPreflightBlockedError(message);
}

function assertSafeMigrationSnapshot(snapshot) {
  const applied = new Set(snapshot.appliedMigrations);
  const pending = new Set(snapshot.pendingMigrations);
  const failed = snapshot.failedMigrations;

  if (failed.length > 0) {
    block(`Unresolved migration state: ${failed.join(", ")}`);
  }
  if (!snapshot.maintenanceModeEnabled) {
    block("Enable application maintenance mode before deploying migrations.");
  }

  if (pending.has(DROP_ALTERNATIVES)) {
    const hasBothColumns =
      snapshot.alternativeColumns.includes("alternativeName") &&
      snapshot.alternativeColumns.includes("alternativeMonthlyPrice");
    if (!hasBothColumns) {
      block(`${DROP_ALTERNATIVES} schema is partial or unexpected.`);
    }
    if (snapshot.alternativeNameRows > 0 || snapshot.alternativePriceRows > 0) {
      block(
        `${DROP_ALTERNATIVES} would remove existing values; export and review them before deploying.`,
      );
    }
  }

  if (pending.has(UNIQUE_STRIPE_IDS)) {
    if (snapshot.stripeUniqueIndexes.length > 0) {
      block(`${UNIQUE_STRIPE_IDS} has an unexpected pre-existing index.`);
    }
    if (
      snapshot.duplicateStripeCustomerGroups > 0 ||
      snapshot.duplicateStripeSubscriptionGroups > 0
    ) {
      block(
        `${UNIQUE_STRIPE_IDS} found duplicate Stripe identifiers; resolve them before deploying.`,
      );
    }
  }

  if (pending.has(ADD_SAVINGS_DEDUPE)) {
    const createMigrationApplied = applied.has(CREATE_SAVINGS_EVENTS);
    if (snapshot.savingsTableExists !== createMigrationApplied) {
      block(`${ADD_SAVINGS_DEDUPE} table state does not match migration history.`);
    }
    if (snapshot.savingsDedupeColumnExists) {
      block(`${ADD_SAVINGS_DEDUPE} column exists before its migration is recorded.`);
    }
  }
}

module.exports = { assertSafeMigrationSnapshot, MigrationPreflightBlockedError };
