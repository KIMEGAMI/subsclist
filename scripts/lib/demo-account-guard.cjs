function assertDemoEmailIsNotAdmin(demoEmail, adminEmail) {
  if (
    typeof demoEmail !== "string" ||
    typeof adminEmail !== "string" ||
    !demoEmail.trim() ||
    !adminEmail.trim() ||
    demoEmail.trim().toLowerCase() === adminEmail.trim().toLowerCase()
  ) {
    throw new Error("Demo and administrator account emails must be distinct and configured.");
  }
}

function assertSeedRecordOwner(record, expectedUserId, resourceName) {
  if (record && record.userId !== expectedUserId) {
    throw new Error(`${resourceName} ID belongs to another account.`);
  }
}

module.exports = { assertDemoEmailIsNotAdmin, assertSeedRecordOwner };
