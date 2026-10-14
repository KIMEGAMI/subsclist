export class ResponseBodyTooLargeError extends Error {
  constructor() {
    super("Response body exceeds the configured size limit");
    this.name = "ResponseBodyTooLargeError";
  }
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Preserve the size-validation error even if the transport cannot cancel.
  }
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Response body size limit must be a non-negative safe integer");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      await cancelResponseBody(response);
      throw new Error("Response has an invalid Content-Length header");
    }
    if (declaredBytes > maxBytes) {
      await cancelResponseBody(response);
      throw new ResponseBodyTooLargeError();
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseBodyTooLargeError();
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } finally {
    reader.releaseLock();
  }
}
