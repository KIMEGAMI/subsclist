import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { isAllowedPublicHttpsUrl } from "./external-url.ts";

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) {
    return /^[23]/i.test(address) && !blockedIpv6.check(address, "ipv6");
  }
  return false;
}

export async function resolvePublicAddresses(
  hostname: string,
  resolve: (hostname: string) => Promise<LookupAddress[]> = (host) =>
    lookup(host, { all: true, verbatim: true }),
) {
  const addresses = await resolve(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Host does not resolve exclusively to public addresses");
  }
  return addresses;
}

export type PublicHttpsTextOptions = {
  accept: string;
  maxBytes: number;
  timeoutMs: number;
};

export type PublicHttpsTextResponse = {
  status: number;
  headers: import("node:http").IncomingHttpHeaders;
  text: string;
};

export async function fetchPublicHttpsText(
  value: string,
  options: PublicHttpsTextOptions,
  resolve?: (hostname: string) => Promise<LookupAddress[]>,
): Promise<PublicHttpsTextResponse> {
  if (!isAllowedPublicHttpsUrl(value)) throw new Error("URL is not allowed");
  const url = new URL(value);
  const addresses = await resolvePublicAddresses(url.hostname, resolve);
  const selected = addresses[0];

  return new Promise((resolve, reject) => {
    const lookupPinned: LookupFunction = (_hostname, _options, callback) => {
      if (_options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, selected.address, selected.family);
    };
    const request = httpsRequest(
      {
        hostname: url.hostname,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { Accept: options.accept },
        lookup: lookupPinned,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (totalBytes > options.maxBytes) {
            response.destroy(new Error("Response exceeds size limit"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    const timeout = setTimeout(() => request.destroy(new Error("Request timed out")), options.timeoutMs);
    request.on("close", () => clearTimeout(timeout));
    request.on("error", reject);
    request.end();
  });
}
