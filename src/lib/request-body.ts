import { MAX_JSON_REQUEST_BODY_BYTES } from "./app-constants.ts";

export async function readJsonBody(request: Request): Promise<unknown> {
  const result = await readJsonBodyWithLimit(
    request,
    MAX_JSON_REQUEST_BODY_BYTES,
  );
  return result.ok ? result.value : null;
}

export type LimitedTextBodyResult =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid_body" | "too_large" };

export type LimitedBodyResult =
  | { ok: true; value: ArrayBuffer }
  | { ok: false; reason: "invalid_body" | "too_large" };

export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    return { ok: false, reason: "invalid_body" };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      return { ok: false, reason: "invalid_body" };
    }
    if (declaredBytes > maxBytes) return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: false, reason: "invalid_body" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { ok: true, value: body.buffer };
  } catch {
    return { ok: false, reason: "invalid_body" };
  } finally {
    reader.releaseLock();
  }
}

export async function readTextBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedTextBodyResult> {
  const body = await readBodyWithLimit(request, maxBytes);
  if (!body.ok) return body;
  try {
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(body.value),
    };
  } catch {
    return { ok: false, reason: "invalid_body" };
  }
}

export type LimitedFormDataResult =
  | { ok: true; value: FormData }
  | { ok: false; reason: "invalid_body" | "too_large" };

export async function readFormDataWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedFormDataResult> {
  const body = await readBodyWithLimit(request, maxBytes);
  if (!body.ok) return body;

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  try {
    if (!headers.has("content-type")) {
      return { ok: false, reason: "invalid_body" };
    }
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: body.value,
    });
    return { ok: true, value: await boundedRequest.formData() };
  } catch {
    return { ok: false, reason: "invalid_body" };
  }
}

export type LimitedJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid_json" | "too_large" };

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonBodyResult> {
  const text = await readTextBodyWithLimit(request, maxBytes);
  if (!text.ok) {
    return {
      ok: false,
      reason: text.reason === "too_large" ? "too_large" : "invalid_json",
    };
  }

  try {
    return { ok: true, value: JSON.parse(text.value) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
