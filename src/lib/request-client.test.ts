import assert from "node:assert/strict";
import test from "node:test";
import { requestClientIdentifier } from "./request-client.ts";

test("X-Forwarded-Forの末尾に追加されたプロキシ側アドレスを使う", () => {
  const request = new Request("http://localhost/api/contact", {
    headers: { "x-forwarded-for": "198.51.100.10, 203.0.113.20" },
  });

  assert.equal(requestClientIdentifier(request), "203.0.113.20");
});

test("転送元がない場合はX-Real-IPを使い、どちらもない場合はunknownを返す", () => {
  const realIpRequest = new Request("http://localhost/api/contact", {
    headers: { "x-real-ip": "203.0.113.20" },
  });
  const unknownRequest = new Request("http://localhost/api/contact");

  assert.equal(requestClientIdentifier(realIpRequest), "203.0.113.20");
  assert.equal(requestClientIdentifier(unknownRequest), "unknown");
});
