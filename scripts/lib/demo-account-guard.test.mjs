import assert from "node:assert/strict";
import test from "node:test";
import guard from "./demo-account-guard.cjs";

const { assertDemoEmailIsNotAdmin, assertSeedRecordOwner } = guard;

test("demo account must not be the administrator account", () => {
  assert.doesNotThrow(() =>
    assertDemoEmailIsNotAdmin("demo@example.test", "admin@example.test"),
  );
  assert.throws(() =>
    assertDemoEmailIsNotAdmin("Admin@Example.test", "admin@example.test"),
  );
  assert.throws(() => assertDemoEmailIsNotAdmin("demo@example.test", ""));
});

test("seed updates allow only the existing row owner", () => {
  assert.doesNotThrow(() => assertSeedRecordOwner(null, "user-a", "Subscription"));
  assert.doesNotThrow(() =>
    assertSeedRecordOwner({ userId: "user-a" }, "user-a", "Subscription"),
  );
  assert.throws(
    () => assertSeedRecordOwner({ userId: "user-b" }, "user-a", "Subscription"),
    /belongs to another account/,
  );
});
