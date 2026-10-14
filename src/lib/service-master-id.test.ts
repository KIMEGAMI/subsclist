import assert from "node:assert/strict";
import test from "node:test";
import { serviceMasterIdSchema } from "./service-master-id.ts";

test("serviceMasterIdSchema accepts seeded and CUID service identifiers", () => {
  assert.equal(serviceMasterIdSchema.safeParse("service_chatgpt").success, true);
  assert.equal(serviceMasterIdSchema.safeParse("clx7l1j9q0000a1b2c3d4e5f6").success, true);
});

test("serviceMasterIdSchema rejects unsafe identifiers", () => {
  assert.equal(serviceMasterIdSchema.safeParse("../service_chatgpt").success, false);
  assert.equal(serviceMasterIdSchema.safeParse("service chatgpt").success, false);
  assert.equal(serviceMasterIdSchema.safeParse("").success, false);
});
