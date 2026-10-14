import assert from "node:assert/strict";
import test from "node:test";
import { MAX_JSON_REQUEST_BODY_BYTES } from "./app-constants.ts";
import { readFormDataWithLimit, readJsonBody, readJsonBodyWithLimit, readTextBodyWithLimit } from "./request-body.ts";

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

test("汎用JSON本文の上限を超えたデータは読み込まない", async () => {
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(MAX_JSON_REQUEST_BODY_BYTES) }),
  });

  assert.equal(await readJsonBody(request), null);
});

test("上限内の複数バイト文字を含むJSONを読み取る", async () => {
  const value = { message: "あ".repeat(2_000) };
  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });

  assert.deepEqual(await readJsonBodyWithLimit(request, 8_192), {
    ok: true,
    value,
  });
});

test("Content-Lengthと実際のストリームの両方で上限超過を拒否する", async () => {
  const declaredLarge = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-length": "9" },
    body: "{}",
  });
  const streamedLarge = new Request("http://localhost/api/contact", {
    method: "POST",
    body: "123456789",
  });

  assert.deepEqual(await readJsonBodyWithLimit(declaredLarge, 8), {
    ok: false,
    reason: "too_large",
  });
  assert.deepEqual(await readJsonBodyWithLimit(streamedLarge, 8), {
    ok: false,
    reason: "too_large",
  });
});

test("不正なJSONを拒否する", async () => {
  const invalidJson = new Request("http://localhost/api/contact", {
    method: "POST",
    body: "{broken",
  });

  assert.deepEqual(await readJsonBodyWithLimit(invalidJson, 64), {
    ok: false,
    reason: "invalid_json",
  });
});

test("上限内のテキストを読み取り、上限超過を拒否する", async () => {
  const accepted = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "署名対象",
  });
  const rejected = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "123456789",
  });

  assert.deepEqual(await readTextBodyWithLimit(accepted, 32), {
    ok: true,
    value: "署名対象",
  });
  assert.deepEqual(await readTextBodyWithLimit(rejected, 8), {
    ok: false,
    reason: "too_large",
  });
});

test("サイズ制限後にmultipartフォームを解析する", async () => {
  const form = new FormData();
  form.set("file", new File(["サービス名,料金\n動画,980"], "subscriptions.csv"));
  const request = new Request("http://localhost/api/import", {
    method: "POST",
    body: form,
  });

  const result = await readFormDataWithLimit(request, 4_096);
  assert.equal(result.ok, true);
  if (result.ok) {
    const file = result.value.get("file");
    assert.ok(file instanceof File);
    assert.equal(await file.text(), "サービス名,料金\n動画,980");
  }
});

test("multipartフォームの本文上限をパース前に拒否する", async () => {
  const request = new Request("http://localhost/api/import", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test-boundary" },
    body: "x".repeat(4_000),
  });

  assert.deepEqual(await readFormDataWithLimit(request, 1_024), {
    ok: false,
    reason: "too_large",
  });
});
