import assert from "node:assert/strict";
import test from "node:test";
import {
  readResponseTextWithLimit,
  ResponseBodyTooLargeError,
} from "./limited-response-body.ts";

test("Content-Lengthがない応答も、ストリームが上限を超えた時点で中断する", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
    },
    cancel() {
      canceled = true;
    },
  });

  await assert.rejects(
    readResponseTextWithLimit(new Response(body), 5),
    ResponseBodyTooLargeError,
  );
  assert.equal(canceled, true);
});

test("Content-Lengthが上限超過なら本文を読み始めず拒否する", async () => {
  const response = new Response(null, { headers: { "content-length": "10" } });

  await assert.rejects(readResponseTextWithLimit(response, 5), ResponseBodyTooLargeError);
});

test("上限以内のUTF-8本文を正しく読み取る", async () => {
  const response = new Response("日本語");
  assert.equal(await readResponseTextWithLimit(response, 9), "日本語");
});
