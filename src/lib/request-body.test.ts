import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody } from "./request-body.ts";

test("正しいJSONを読み取る", async () => {
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "SubscList" }),
  });
  assert.deepEqual(await readJsonBody(request), { name: "SubscList" });
});

test("壊れたJSONは例外を外へ出さずnullを返す", async () => {
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(await readJsonBody(request), null);
});
